import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Spell checking the picker box against a real Obsidian, which is the only place the starting point can
 * be observed: Obsidian builds every `SuggestModal` input with a hardcoded `spellcheck="false"` and never
 * consults `Editor > Spellcheck` there, and `obsidian-test-mocks` does not reproduce that.
 *
 * The box doubles as the new note's title — `Create new` takes what is typed verbatim — so it follows the
 * setting while that offer stands, and is left exactly as Obsidian built it while it does not.
 *
 * Driven by CLICKING `Folders only` rather than pressing its hotkey, which is what makes this suite
 * cross-platform: a phone has no `Alt` key, and the harness cannot send keys to Android anyway.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface SpellcheckResult {
  readonly whenFoldersOnly: null | string;
  readonly whenSettingOff: null | string;
  readonly whenSettingOn: null | string;
  readonly whenToggledBack: null | string;
}

describe('spell checking the picker box', () => {
  it('follows the vault setting while a note can be named, and stops while it cannot', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, pluginId }): Promise<SpellcheckResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 30_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;

        const originalSpellcheck = app.vault.getConfig('spellcheck');
        // The source note is deliberately empty, so a content read-back would prove nothing.
        const source = await app.vault.create(`Source-${stamp}.md`, '');

        await app.workspace.getLeaf(true).openFile(source);
        await waitUntil({
          message: 'the note being edited is open',
          predicate: () => app.workspace.getActiveFile()?.path === source.path,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        try {
          app.vault.setConfig('spellcheck', true);
          await openPicker();
          const whenSettingOn = readSpellcheck();

          clickControl('Folders only');
          await sleep(RENDER_DELAY_IN_MILLISECONDS);
          const whenFoldersOnly = readSpellcheck();

          clickControl('Folders only');
          await sleep(RENDER_DELAY_IN_MILLISECONDS);
          const whenToggledBack = readSpellcheck();

          await closePicker();

          app.vault.setConfig('spellcheck', false);
          await openPicker();
          const whenSettingOff = readSpellcheck();
          await closePicker();

          return {
            whenFoldersOnly,
            whenSettingOff,
            whenSettingOn,
            whenToggledBack
          };
        } finally {
          app.vault.setConfig('spellcheck', originalSpellcheck);
          await closePicker();
        }

        function clickControl(label: string): void {
          const buttonEl = [...document.querySelectorAll('.modal-command')]
            .find((el) => el.querySelector('span')?.textContent === label);
          if (!(buttonEl instanceof HTMLElement)) {
            throw new TypeError(`No control labelled ${label}.`);
          }
          buttonEl.click();
        }

        async function closePicker(): Promise<void> {
          if (!document.querySelector('.prompt')) {
            return;
          }

          // Closed by CHOOSING a row rather than by a key press: `Escape` would have to be dispatched
          // Untrusted, which Obsidian may ignore, and the trusted `pressKey` is desktop-only while
          // This suite also runs on Android. A pick closes the picker through its own resolve path.
          chooseFirstRow();
          await waitUntil({
            message: 'the picker closed',
            predicate: () => document.querySelector('.prompt') === null,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });
        }

        function chooseFirstRow(): void {
          const row = document.querySelector('.suggestion-item');
          if (!(row instanceof HTMLElement)) {
            throw new TypeError('The picker offered nothing to choose.');
          }
          row.click();
        }

        async function openPicker(): Promise<void> {
          app.commands.executeCommandById(`${pluginId}:insert-link`);
          await waitUntil({
            message: 'the picker is open',
            predicate: () => document.querySelector('.prompt-input') !== null,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });
          await sleep(RENDER_DELAY_IN_MILLISECONDS);
        }

        function readSpellcheck(): null | string {
          return document.querySelector('.prompt-input')?.getAttribute('spellcheck') ?? null;
        }
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.whenSettingOn).toBe('true');
    // The value Obsidian itself hardcodes, which is exactly what a box that only finds notes should keep.
    expect(result.whenFoldersOnly).toBe('false');
    expect(result.whenToggledBack).toBe('true');
    expect(result.whenSettingOff).toBe('false');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

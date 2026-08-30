import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The keyboard route, against a real Obsidian. Every behavior it reaches is also covered by clicking its
 * control, cross-platform — what only a key press can prove is that the key is CONSUMED.
 *
 * That is the regression this suite exists for: unconsumed, Obsidian typed the character as well as
 * running the handler, so `Alt + 1` closed the picker and then wrote `1` into the note being edited. A
 * click can never show that, and no unit test with a mocked scope can either.
 *
 * Desktop only, and deliberately: the harness drives keys through Electron's input API, which Android
 * has not got. The behaviors themselves are not desktop-only — their controls are tapped on a phone,
 * which is why the six suites that cover them are cross-platform (G97, G47).
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface HotkeyResult {
  readonly editorText: string;
  readonly rowsAfterToggle: string[];
  readonly wasPickerClosed: boolean;
}

describe('A picker hotkey', () => {
  it('runs its handler and consumes the key, rather than also typing the digit', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil }, obsidianModule, pluginId }): Promise<HotkeyResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `Hotkeys-${stamp}`;

        await app.vault.createFolder(folderName);
        await app.vault.create(`${folderName}/Note-${stamp}.md`, '# Note\n');
        await app.vault.create(`${folderName}/Data-${stamp}.txt`, 'plain text');
        const source = await app.vault.create(`Source-${stamp}.md`, 'body');

        await app.workspace.getLeaf(true).openFile(source);
        await waitUntil({
          message: 'the note being edited is open',
          predicate: () => app.workspace.getActiveFile()?.path === source.path,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        await waitUntil({
          message: 'no picker left open by an earlier suite',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        app.commands.executeCommandById(`${pluginId}:insert-link`);
        await waitUntil({
          message: 'the picker is open',
          predicate: () => document.querySelector('.prompt') !== null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        // Into the folder, so a toggle has something to change.
        await filterTo(folderName);
        const folderRow = document.querySelector('.suggestion-item');
        if (!(folderRow instanceof HTMLElement)) {
          throw new TypeError('The folder was not offered.');
        }
        folderRow.click();
        await waitUntil({
          message: 'the folder is open',
          predicate: () => rows().some((text) => text.includes('Note-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        // `Alt + 2` shows the plain file. If the key were not consumed, `2` would ALSO reach the search
        // Box and filter the list down to whatever happens to contain a `2`.
        focusInput();
        pressKey({ key: '2', modifiers: ['Alt'] });
        await waitUntil({
          message: 'the plain file is offered',
          predicate: () => rows().some((text) => text.includes('Data-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsAfterToggle = rows();

        // `Alt + 1` closes the picker. An unconsumed key then carries on to the editor that regains
        // Focus, and types `1` into the note.
        focusInput();
        pressKey({ key: '1', modifiers: ['Alt'] });
        await waitUntil({
          message: 'the picker closed',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        return {
          editorText: app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '',
          rowsAfterToggle,
          wasPickerClosed: document.querySelector('.prompt') === null
        };

        async function filterTo(query: string): Promise<void> {
          const input = focusInput();
          input.value = query;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitUntil({
            message: 'any row',
            predicate: () => document.querySelector('.suggestion-item') !== null,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });
          await sleep(RENDER_DELAY_IN_MILLISECONDS);
        }

        function focusInput(): HTMLInputElement {
          const input = document.querySelector('.prompt-input');
          if (!(input instanceof HTMLInputElement)) {
            throw new TypeError('The picker has no input.');
          }
          input.focus();
          return input;
        }

        function rows(): string[] {
          return [...document.querySelectorAll('.suggestion-item')].map((el) => el.textContent);
        }
      },
      input: { pluginId: PLUGIN_ID }
    });

    // The toggle ran, and the list was not additionally filtered by the digit.
    expect(result.rowsAfterToggle.join('\n')).toContain('Data-');
    expect(result.rowsAfterToggle.join('\n')).toContain('Note-');

    expect(result.wasPickerClosed).toBe(true);

    // The note is untouched: no link, and no stray `1`.
    expect(result.editorText).toBe('body');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

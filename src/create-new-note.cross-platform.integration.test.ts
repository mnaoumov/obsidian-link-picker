import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The `Create new` control against a real Obsidian: the note you meant to link to does not have to exist yet.
 * It is created in the folder the picker is currently rooted at, and linked in one gesture.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform (G47): the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface CreateNewNoteResult {
  readonly createdPath: null | string;
  readonly editorText: string;
}

describe('The `Create new` control', () => {
  it('creates the note the typed name asks for and links to it', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, obsidianModule, pluginId }): Promise<CreateNewNoteResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 30_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const newName = `Created-${stamp}`;

        // The source note is deliberately empty, so a content read-back would prove nothing.
        const source = await app.vault.create(`Source-${stamp}.md`, '');

        await app.workspace.getLeaf(true).openFile(source);
        await waitUntil({
          message: 'the note being edited is open',
          predicate: () => app.workspace.getActiveFile()?.path === source.path,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        app.commands.executeCommandById(`${pluginId}:insert-link`);
        await waitUntil({
          message: 'the picker is open',
          predicate: () => document.querySelector('.prompt') !== null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        const input = document.querySelector('.prompt-input');
        if (!(input instanceof HTMLInputElement)) {
          throw new TypeError('The picker has no input.');
        }

        // Typed, but matching nothing — which is exactly when creating is the useful answer.
        input.value = newName;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        input.focus();
        clickControl('Create new');

        await waitUntil({
          message: 'the note exists',
          predicate: () => app.vault.getAbstractFileByPath(`${newName}.md`) !== null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await waitUntil({
          message: 'the picker closed',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        return {
          createdPath: app.vault.getAbstractFileByPath(`${newName}.md`)?.path ?? null,
          editorText: app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? ''
        };

        function clickControl(label: string): void {
          const buttonEl = [...document.querySelectorAll('.modal-command')]
            .find((el) => el.querySelector('span')?.textContent === label);
          if (!(buttonEl instanceof HTMLElement)) {
            throw new TypeError(`No control labelled ${label}.`);
          }
          buttonEl.click();
        }
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.createdPath).toContain('Created-');
    expect(result.editorText).toContain('Created-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

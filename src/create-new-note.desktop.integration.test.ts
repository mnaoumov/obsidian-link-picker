import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * `Shift + Enter` against a real Obsidian: the note you meant to link to does not have to exist yet.
 * It is created in the folder the picker is currently rooted at, and linked in one gesture.
 *
 * Desktop only, and NOT because the behavior is (the manifest declares `isDesktopOnly: false`). The
 * harness drives keys through Electron's input API, which does not exist on Android, so a hotkey cannot
 * be pressed there at all — the wall is the harness's, not the plugin's. Recorded here and in T648-P44
 * per G97; on a phone the same toggles are reachable from the picker's instruction bar.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface CreateNewNoteResult {
  readonly createdPath: null | string;
  readonly editorText: string;
}

describe('`Shift + Enter` in the picker', () => {
  it('creates the note the typed name asks for and links to it', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil }, obsidianModule, pluginId }): Promise<CreateNewNoteResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const newName = `Created-${stamp}`;

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
        pressKey({ key: 'Enter', modifiers: ['Shift'] });

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
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.createdPath).toContain('Created-');
    expect(result.editorText).toContain('Created-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

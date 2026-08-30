import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * `Alt + 1` against a real Obsidian: declining a link is a choice the picker makes available, distinct
 * from dismissing it — a template that asks for an optional link needs an empty answer, not a rejection.
 *
 * Regression cover, too: the row is backed by the vault root, which is a folder, so before this was
 * fixed `Alt + 1` navigated to the root instead of resolving empty.
 *
 * Desktop only, and NOT because the behavior is (the manifest declares `isDesktopOnly: false`). The
 * harness drives keys through Electron's input API, which does not exist on Android, so a hotkey cannot
 * be pressed there at all — the wall is the harness's, not the plugin's. Recorded here and in T648-P44
 * per G97; on a phone the same toggles are reachable from the picker's instruction bar.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface SelectEmptyResult {
  readonly editorText: string;
  readonly wasPickerClosed: boolean;
}

describe('`Alt + 1` in the picker', () => {
  it('closes it and writes nothing, rather than navigating to the vault root', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil }, obsidianModule, pluginId }): Promise<SelectEmptyResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;

        const source = await app.vault.create(`Source-${stamp}.md`, 'body');

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
        input.focus();
        pressKey({ key: '1', modifiers: ['Alt'] });

        await waitUntil({
          message: 'the picker closed',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        return {
          editorText: app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '',
          wasPickerClosed: document.querySelector('.prompt') === null
        };
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.wasPickerClosed).toBe(true);
    expect(result.editorText).toBe('body');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

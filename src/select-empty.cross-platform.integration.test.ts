import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The `No link` control against a real Obsidian: declining a link is a choice the picker makes available, distinct
 * from dismissing it — a template that asks for an optional link needs an empty answer, not a rejection.
 *
 * Regression cover, too: the row is backed by the vault root, which is a folder, so before this was
 * fixed `Alt + 1` navigated to the root instead of resolving empty.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform (G47): the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface SelectEmptyResult {
  readonly editorText: string;
  readonly wasPickerClosed: boolean;
}

describe('The `No link` control', () => {
  it('closes it and writes nothing, rather than navigating to the vault root', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, obsidianModule, pluginId }): Promise<SelectEmptyResult> {
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
        clickControl('No link');

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

        function clickControl(label: string): void {
          const buttonEl = [...document.querySelectorAll('.link-picker-control')]
            .find((el) => el.querySelector('span')?.textContent === label);
          if (!(buttonEl instanceof HTMLElement)) {
            throw new TypeError(`No control labelled ${label}.`);
          }
          buttonEl.click();
        }
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.wasPickerClosed).toBe(true);
    expect(result.editorText).toBe('body');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

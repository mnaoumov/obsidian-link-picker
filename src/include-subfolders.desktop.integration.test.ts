import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * `Alt + 3` against a real Obsidian: the picker lists one folder's own contents until subfolders are
 * asked for, and then it reaches through them.
 *
 * Desktop only, and NOT because the behavior is (the manifest declares `isDesktopOnly: false`). The
 * harness drives keys through Electron's input API, which does not exist on Android, so a hotkey cannot
 * be pressed there at all — the wall is the harness's, not the plugin's. Recorded here and in T648-P44
 * per G97; on a phone the same toggles are reachable from the picker's instruction bar.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface IncludeSubfoldersResult {
  readonly rowsAfterToggle: string[];
  readonly rowsBeforeToggle: string[];
}

describe('`Alt + 3` in the picker', () => {
  it('reaches into subfolders, which are otherwise left alone', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil }, pluginId }): Promise<IncludeSubfoldersResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `Subfolders-${stamp}`;
        const deepName = `Deep-${stamp}`;

        await app.vault.createFolder(folderName);
        await app.vault.createFolder(`${folderName}/${deepName}`);
        await app.vault.create(`${folderName}/${deepName}/Buried-${stamp}.md`, '# Buried\n');
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

        // Into the folder first, so the toggle is exercised where there is a subfolder to reach into.
        await filterTo(folderName);
        chooseFirstRow();
        await waitUntil({
          message: 'the folder is open',
          predicate: () => rows().some((text) => text.includes(deepName)),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsBeforeToggle = rows();

        focusInput();
        pressKey({ key: '3', modifiers: ['Alt'] });
        await waitUntil({
          message: 'the buried note is reached',
          predicate: () => rows().some((text) => text.includes('Buried-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsAfterToggle = rows();

        pressKey({ key: 'Escape' });

        return { rowsAfterToggle, rowsBeforeToggle };

        function chooseFirstRow(): void {
          const row = document.querySelector('.suggestion-item');
          if (!(row instanceof HTMLElement)) {
            throw new TypeError('The picker offered nothing to choose.');
          }
          row.click();
        }

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

    expect(result.rowsBeforeToggle.join('\n')).not.toContain('Buried-');
    expect(result.rowsAfterToggle.join('\n')).toContain('Buried-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

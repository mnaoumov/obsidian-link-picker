import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * `Alt + 2` against a real Obsidian: the picker offers notes, because a note is what you link to by
 * name, until everything is asked for.
 *
 * Cross-platform (G47): the manifest declares `isDesktopOnly: false`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface IncludeAllFilesResult {
  readonly rowsAfterToggle: string[];
  readonly rowsBeforeToggle: string[];
}

describe('`Alt + 2` in the picker', () => {
  it('offers files that are not notes, which are otherwise hidden', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil }, pluginId }): Promise<IncludeAllFilesResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `AllFiles-${stamp}`;

        await app.vault.createFolder(folderName);
        await app.vault.create(`${folderName}/Note-${stamp}.md`, '# Note\n');
        await app.vault.create(`${folderName}/Data-${stamp}.txt`, 'plain text');
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

        await filterTo(folderName);
        chooseFirstRow();
        await waitUntil({
          message: 'the folder is open',
          predicate: () => rows().some((text) => text.includes('Note-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsBeforeToggle = rows();

        focusInput();
        pressKey({ key: '2', modifiers: ['Alt'] });
        await waitUntil({
          message: 'the plain file is offered',
          predicate: () => rows().some((text) => text.includes('Data-')),
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

    expect(result.rowsBeforeToggle.join('\n')).not.toContain('Data-');
    expect(result.rowsAfterToggle.join('\n')).toContain('Data-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Folder drill-in and drill-out, against a real Obsidian. This is the picker's whole reason for
 * existing over Obsidian's own `[[`, so it is the behavior most worth pinning end to end.
 *
 * Cross-platform (G47): the manifest declares `isDesktopOnly: false`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface FolderNavigationResult {
  readonly rowsAfterDrillIn: string[];
  readonly rowsAfterDrillOut: string[];
  readonly rowsAtRoot: string[];
}

describe('Choosing a folder in the picker', () => {
  it('descends into it, and `..` comes back out', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil }, pluginId }): Promise<FolderNavigationResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `Nav-${stamp}`;
        const innerName = `Inner-${stamp}`;

        await app.vault.createFolder(folderName);
        await app.vault.create(`${folderName}/${innerName}.md`, '# Inner\n');
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
        const rowsAtRoot = rows();
        chooseFirstRow();

        // Choosing a folder reopens the picker rooted inside it rather than resolving a link.
        await waitUntil({
          message: 'the folder\'s own contents are listed',
          predicate: () => rows().some((text) => text.includes(innerName)),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsAfterDrillIn = rows();

        // The way out is not reachable by typing: `..` is a pinned row, not a name the query matches.
        await filterTo('');
        chooseRow('..');

        // Back at the root the listing is the whole vault, which the modal caps, so the folder is
        // Filtered back to rather than looked for among however many rows fit.
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        await filterTo(folderName);
        const rowsAfterDrillOut = rows();

        pressKey({ key: 'Escape' });

        return { rowsAfterDrillIn, rowsAfterDrillOut, rowsAtRoot };

        function chooseFirstRow(): void {
          const row = document.querySelector('.suggestion-item');
          if (!(row instanceof HTMLElement)) {
            throw new TypeError('The picker offered nothing to choose.');
          }
          row.click();
        }

        function chooseRow(text: string): void {
          const row = [...document.querySelectorAll('.suggestion-item')].find((el) => el.textContent.trim() === text);
          if (!(row instanceof HTMLElement)) {
            throw new TypeError(`The picker offered no row reading ${text}.`);
          }
          row.click();
        }

        async function filterTo(query: string): Promise<void> {
          const input = document.querySelector('.prompt-input');
          if (!(input instanceof HTMLInputElement)) {
            throw new TypeError('The picker has no input.');
          }
          input.value = query;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitUntil({
            message: query ? 'a row matching the query' : 'any row',
            predicate: () => document.querySelector('.suggestion-item') !== null,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });
          await sleep(RENDER_DELAY_IN_MILLISECONDS);
        }

        function rows(): string[] {
          return [...document.querySelectorAll('.suggestion-item')].map((el) => el.textContent);
        }
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.rowsAtRoot.join('\n')).toContain('Nav-');
    expect(result.rowsAfterDrillIn.join('\n')).toContain('Inner-');
    expect(result.rowsAfterDrillIn.join('\n')).toContain('..');
    expect(result.rowsAfterDrillOut.join('\n')).toContain('Nav-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The `Folders only` control against a real Obsidian: the picker hides everything that is not a folder, so a deep folder
 * can be navigated to without reading past the notes on the way.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform (G47): the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface ShowOnlyFoldersResult {
  readonly rowsAfterToggle: string[];
  readonly rowsBeforeToggle: string[];
}

describe('The `Folders only` control', () => {
  it('leaves only the folders, and the way out', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { createNote, waitUntil }, pluginId }): Promise<ShowOnlyFoldersResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 30_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `OnlyFolders-${stamp}`;

        await app.vault.createFolder(folderName);
        await app.vault.createFolder(`${folderName}/Nested-${stamp}`);
        await createNote({
          content: '# Note\n',
          path: `${folderName}/Note-${stamp}.md`
        });
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
        clickControl('Folders only');
        await waitUntil({
          message: 'only the folders are listed',
          predicate: () => rows().some((text) => text.includes('Nested-')) && rows().every((text) => !text.includes('Note-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsAfterToggle = rows();

        clickControl('Folders only');
        await waitUntil({
          message: 'the notes are back',
          predicate: () => rows().some((text) => text.includes('Note-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        chooseRow('Note-');
        await waitUntil({
          message: 'the picker closed on a pick',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        return { rowsAfterToggle, rowsBeforeToggle };

        function chooseRow(text: string): void {
          const row = [...document.querySelectorAll('.suggestion-item')].find((el) => el.textContent.includes(text));
          if (!(row instanceof HTMLElement)) {
            throw new TypeError(`No row containing ${text}.`);
          }
          row.click();
        }

        function clickControl(label: string): void {
          const buttonEl = [...document.querySelectorAll('.modal-command')]
            .find((el) => el.querySelector('span')?.textContent === label);
          if (!(buttonEl instanceof HTMLElement)) {
            throw new TypeError(`No control labelled ${label}.`);
          }
          buttonEl.click();
        }
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

    expect(result.rowsBeforeToggle.join('\n')).toContain('Note-');
    expect(result.rowsAfterToggle.join('\n')).not.toContain('Note-');
    expect(result.rowsAfterToggle.join('\n')).toContain('Nested-');
    expect(result.rowsAfterToggle.join('\n')).toContain('..');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

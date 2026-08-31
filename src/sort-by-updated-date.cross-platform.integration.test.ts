import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The `By date` control against a real Obsidian: with no query typed, the picker leads with what changed most
 * recently, and that ordering can be turned off in favour of a plain alphabetical one.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform (G47): the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface SortByUpdatedDateResult {
  readonly rowsAfterToggle: string[];
  readonly rowsBeforeToggle: string[];
}

describe('The `By date` control', () => {
  it('stops leading with the most recently updated note', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { createNote, waitUntil }, pluginId }): Promise<SortByUpdatedDateResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const TIMEOUT_IN_MILLISECONDS = 30_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `Updated-${stamp}`;

        await app.vault.createFolder(folderName);

        // `Alpha` is written first and `Zulu` second, so the two orderings disagree: by date `Zulu`
        // Leads, alphabetically `Alpha` does.
        await createNote({
          content: '# Alpha\n',
          path: `${folderName}/Alpha-${stamp}.md`
        });
        await sleep(1100);
        await createNote({
          content: '# Zulu\n',
          path: `${folderName}/Zulu-${stamp}.md`
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
          predicate: () => rows().some((text) => text.includes('Alpha-')),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsBeforeToggle = rows();

        focusInput();
        clickControl('By date');
        await waitUntil({
          message: 'the ordering changed',
          predicate: () => rows().join('\n') !== rowsBeforeToggle.join('\n'),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const rowsAfterToggle = rows();

        chooseRow('Alpha-');
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
          const buttonEl = [...document.querySelectorAll('.link-picker-control')]
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

    expect(noteRows(result.rowsBeforeToggle)[0]).toContain('Zulu-');
    expect(noteRows(result.rowsAfterToggle)[0]).toContain('Alpha-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Drops the pinned `..` row, which leads either ordering and says nothing about which one is in force.
 *
 * @param rows - The rows the picker showed.
 * @returns The note rows.
 */
function noteRows(rows: string[]): string[] {
  return rows.filter((text) => text.trim() !== '..');
}

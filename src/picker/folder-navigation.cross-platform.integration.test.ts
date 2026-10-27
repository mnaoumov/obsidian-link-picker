import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Folder drill-in and drill-out, against a real Obsidian. This is the picker's whole reason for
 * existing over Obsidian's own `[[`, so it is the behavior most worth pinning end to end.
 *
 * Cross-platform: the manifest declares `isDesktopOnly: false`.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so six waits sharing one closure could
 * never each get the budget they declared - the eval died at the cap first and reported a bare transport
 * timeout naming the harness rather than the wait that overran. `pollInObsidian` is what makes the budget
 * real: each poll is its own short eval, and `until` runs in Node, where it can close over the names this
 * test already holds.
 */

const PLUGIN_ID = 'link-picker';

const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

/**
 * A render settle, short enough to sit inside an act closure without approaching the per-eval cap.
 */
const RENDER_DELAY_IN_MILLISECONDS = 400;

/**
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's: Android
 * sets the floor, not desktop, and an aged emulator takes tens of seconds to lay out.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * Above the sum of the budgets used below, so a genuine stall reports the NAMED poll timeout rather than
 * losing the race to a bare vitest timeout.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

describe('Choosing a folder in the picker', () => {
  it('descends into it, and `..` comes back out', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const folderName = `Nav-${stamp}`;
    const innerName = `Inner-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { folderName, innerName, sourcePath },
      poll({ app, folderName: folder, innerName: inner, sourcePath: path }): boolean {
        return app.vault.getFileByPath(`${folder}/${inner}.md`) !== null && app.vault.getFileByPath(path) !== null;
      },
      async start({ app, folderName: folder, innerName: inner, lib: { createNote }, sourcePath: path }): Promise<void> {
        await app.vault.createFolder(folder);
        await createNote({
          content: '# Inner\n',
          path: `${folder}/${inner}.md`
        });
        // The source note is deliberately empty, so a content read-back would prove nothing.
        await app.vault.create(path, '');
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the staged notes never appeared in the vault',
      until: (arePresent: boolean): boolean => arePresent
    });

    await openSourceNote(sourcePath);
    await openPicker();

    await filterTo(folderName);
    const rowsAtRoot = await readRows();
    await chooseFirstRow();

    // Choosing a folder reopens the picker rooted inside it rather than resolving a link.
    await pollRows('the folder\'s own contents are never listed', (rows: string[]): boolean => rows.some((text) => text.includes(innerName)));
    const rowsAfterDrillIn = await readRows();

    // The way out is not reachable by typing: `..` is a pinned row, not a name the query matches.
    await filterTo('');
    await chooseExactRow('..');

    // Back at the root the listing is the whole vault, which the modal caps.
    // The folder is therefore filtered back to rather than looked for among however many rows fit.
    await filterTo(folderName);
    const rowsAfterDrillOut = await readRows();

    // Finished by actually PICKING something, rather than by dismissing the picker.
    // These suites share one Obsidian, so a picker left open is the next suite's first `.prompt`.
    // Ending on the product's own terminal path is a truer close than any synthetic key would be.
    await chooseFirstRow();
    await pollRows('the folder never opened again', (rows: string[]): boolean => rows.some((text) => text.includes(innerName)));
    await chooseExactRow(`${innerName}.md`);
    await pollPickerClosed('the picker never closed on the pick');

    expect(rowsAtRoot.join('\n')).toContain('Nav-');
    expect(rowsAfterDrillIn.join('\n')).toContain('Inner-');
    expect(rowsAfterDrillIn.join('\n')).toContain('..');
    expect(rowsAfterDrillOut.join('\n')).toContain('Nav-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Clicks the row whose whole text is what is asked for, which is how the pinned `..` is addressed.
 *
 * @param text - The row's exact text.
 */
async function chooseExactRow(text: string): Promise<void> {
  await evalInObsidian({
    callback({ rowSelector, rowText }): void {
      const row = [...document.querySelectorAll(rowSelector)].find((el) => el.textContent.trim() === rowText);
      if (!(row instanceof HTMLElement)) {
        throw new TypeError(`The picker offered no row reading ${rowText}.`);
      }

      row.click();
    },
    input: { rowSelector: ROW_SELECTOR, rowText: text }
  });
}

/**
 * Clicks whatever the picker is leading with.
 */
async function chooseFirstRow(): Promise<void> {
  await evalInObsidian({
    callback({ rowSelector }): void {
      const row = document.querySelector(rowSelector);
      if (!(row instanceof HTMLElement)) {
        throw new TypeError('The picker offered nothing to choose.');
      }

      row.click();
    },
    input: { rowSelector: ROW_SELECTOR }
  });
}

/**
 * Types a query into the picker and waits for it to have something to show.
 *
 * @param query - What to type, or the empty string to clear the box.
 */
async function filterTo(query: string): Promise<void> {
  await evalInObsidian({
    callback({ inputSelector, query: text }): void {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The picker has no input.');
      }

      input.focus();
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    input: { inputSelector: INPUT_SELECTOR, query }
  });

  await pollRows(query ? 'no row ever matched the query' : 'the picker never offered a row', (rows: string[]): boolean => rows.length > 0);
}

/**
 * Runs the editor command and waits for the picker to come up.
 */
async function openPicker(): Promise<void> {
  await pollInObsidian({
    input: { pluginId: PLUGIN_ID, promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) !== null;
    },
    start({ app, pluginId }): void {
      app.commands.executeCommandById(`${pluginId}:insert-link`);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never opened',
    until: (isOpen: boolean): boolean => isOpen
  });
}

/**
 * Opens the note the link is to be inserted into, and waits for it to become the active file.
 *
 * @param sourcePath - The note's path.
 */
async function openSourceNote(sourcePath: string): Promise<void> {
  await pollInObsidian({
    input: { sourcePath },
    poll({ app }): string {
      return app.workspace.getActiveFile()?.path ?? '';
    },
    async start({ app, sourcePath: path }): Promise<void> {
      const source = app.vault.getFileByPath(path);
      if (!source) {
        throw new Error(`The source note ${path} is gone.`);
      }

      await app.workspace.getLeaf(true).openFile(source);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the note being edited never became the active file',
    until: (path: string): boolean => path === sourcePath
  });
}

/**
 * Waits for the picker to be gone.
 *
 * @param message - What to say if it never is.
 */
async function pollPickerClosed(message: string): Promise<void> {
  await pollInObsidian({
    input: { promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) === null;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: message,
    until: (isClosed: boolean): boolean => isClosed
  });
}

/**
 * Polls the picker's rows until the Node-side predicate accepts them.
 *
 * The predicate runs in NODE, which is what lets it close over the stamped names this test already holds
 * rather than passing each of them across the boundary.
 *
 * @param message - What to say if the rows never satisfy the predicate.
 * @param checkRows - Whether a given reading of the rows is the one being waited for.
 * @returns The accepted rows.
 */
async function pollRows(message: string, checkRows: (rows: string[]) => boolean): Promise<string[]> {
  return await pollInObsidian({
    input: { rowSelector: ROW_SELECTOR },
    poll({ rowSelector }): string[] {
      return [...document.querySelectorAll(rowSelector)].map((el) => el.textContent);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: message,
    until: checkRows
  });
}

/**
 * Lets the list settle, then reads it.
 *
 * The settle stays INSIDE the closure it guards: a poll for a list that has already stopped changing
 * accepts the reading from before the re-render that is still on its way.
 *
 * @returns The rows the picker is showing.
 */
async function readRows(): Promise<string[]> {
  return await evalInObsidian({
    async callback({ renderDelayInMilliseconds, rowSelector }): Promise<string[]> {
      await sleep(renderDelayInMilliseconds);
      return [...document.querySelectorAll(rowSelector)].map((el) => el.textContent);
    },
    input: { renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS, rowSelector: ROW_SELECTOR }
  });
}

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
 * The `By date` control against a real Obsidian: with no query typed, the picker leads with what changed most
 * recently, and that ordering can be turned off in favour of a plain alphabetical one.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform: the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so six waits sharing one closure could
 * never each get the budget they declared. It also buys something this suite needed in particular: the
 * "the ordering changed" wait compares against the rows read BEFORE the toggle, and `until` runs in Node,
 * where that array already is.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

/**
 * Long enough for the two notes to carry different modification times, which is the whole premise of the
 * test: `Alpha` is written first and `Zulu` second, so the two orderings disagree.
 */
const STAGGER_DELAY_IN_MILLISECONDS = 1100;

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

describe('The `By date` control', () => {
  it('stops leading with the most recently updated note', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const folderName = `Updated-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { folderName, sourcePath, staggerDelayInMilliseconds: STAGGER_DELAY_IN_MILLISECONDS, stamp },
      poll({ app, folderName: folder, sourcePath: path, stamp: suffix }): boolean {
        return app.vault.getFileByPath(`${folder}/Alpha-${suffix}.md`) !== null
          && app.vault.getFileByPath(`${folder}/Zulu-${suffix}.md`) !== null
          && app.vault.getFileByPath(path) !== null;
      },
      async start({ app, folderName: folder, lib: { createNote }, sourcePath: path, staggerDelayInMilliseconds, stamp: suffix }): Promise<void> {
        await app.vault.createFolder(folder);
        await createNote({
          content: '# Alpha\n',
          path: `${folder}/Alpha-${suffix}.md`
        });
        await sleep(staggerDelayInMilliseconds);
        await createNote({
          content: '# Zulu\n',
          path: `${folder}/Zulu-${suffix}.md`
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
    await chooseFirstRow();
    await pollRows('the folder never opened', (rows: string[]): boolean => rows.some((text) => text.includes('Alpha-')));
    const rowsBeforeToggle = await readRows();

    await clickControl('By date');

    // `until` runs in Node, so it compares against the reading this test already holds.
    // That array is therefore never shipped back across the boundary on every poll.
    await pollRows('the ordering never changed', (rows: string[]): boolean => rows.join('\n') !== rowsBeforeToggle.join('\n'));
    const rowsAfterToggle = await readRows();

    await chooseRow('Alpha-');
    await pollPickerClosed('the picker never closed on the pick');

    expect(noteRows(rowsBeforeToggle)[0]).toContain('Zulu-');
    expect(noteRows(rowsAfterToggle)[0]).toContain('Alpha-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

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
 * Clicks the first row whose text contains what is asked for.
 *
 * @param text - A fragment of the row's text.
 */
async function chooseRow(text: string): Promise<void> {
  await evalInObsidian({
    callback({ rowSelector, rowText }): void {
      const row = [...document.querySelectorAll(rowSelector)].find((el) => el.textContent.includes(rowText));
      if (!(row instanceof HTMLElement)) {
        throw new TypeError(`No row containing ${rowText}.`);
      }

      row.click();
    },
    input: { rowSelector: ROW_SELECTOR, rowText: text }
  });
}

/**
 * Focuses the search box and clicks a control, in ONE closure.
 *
 * The focus is what the control's `mousedown` `preventDefault` exists to protect, so it belongs in the
 * same round trip as the click rather than in one the picker can re-render between.
 *
 * @param label - The control's visible label.
 */
async function clickControl(label: string): Promise<void> {
  await evalInObsidian({
    callback({ controlSelector, inputSelector, label: controlLabel }): void {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The picker has no input.');
      }

      input.focus();

      const buttonEl = [...document.querySelectorAll(controlSelector)]
        .find((el) => el.querySelector('span')?.textContent === controlLabel);
      if (!(buttonEl instanceof HTMLElement)) {
        throw new TypeError(`No control labelled ${controlLabel}.`);
      }

      buttonEl.click();
    },
    input: { controlSelector: CONTROL_SELECTOR, inputSelector: INPUT_SELECTOR, label }
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

  await pollRows('the picker never offered a row', (rows: string[]): boolean => rows.length > 0);
}

/**
 * Drops the pinned `..` row, which leads either ordering and says nothing about which one is in force.
 *
 * @param rows - The rows the picker showed.
 * @returns The note rows.
 */
function noteRows(rows: string[]): string[] {
  return rows.filter((text) => text.trim() !== '..');
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

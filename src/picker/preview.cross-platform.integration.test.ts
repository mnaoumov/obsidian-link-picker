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
 * The `Preview` control against a real Obsidian: the pane under the list renders the highlighted row's note,
 * and follows the highlight when it moves, all without closing the picker.
 *
 * Driven by CLICKING the control, so the suite is cross-platform; the highlight is moved by TYPING, which
 * re-ranks the list and leaves Obsidian's chooser to highlight the new first row. A synthetic `mousemove`
 * would move it too, but it is an untrusted event, and moving the highlight the way a user does is what
 * this suite is for.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading**, for the same
 * reason as every other suite here: one `evalInObsidian` closure is capped at ~30s by the transport.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const INPUT_SELECTOR = '.prompt-input';
const PREVIEW_SELECTOR = '.link-picker-preview';
const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

/**
 * Generous on purpose: Android sets the floor, not desktop.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * Above the sum of the budgets used below, so a genuine stall reports the NAMED poll timeout.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

describe('The `Preview` control', () => {
  it('shows the highlighted note without closing the picker, and follows the highlight', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const folderName = `Preview-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;
    const alphaBody = `alpha body ${stamp}`;
    const betaBody = `beta body ${stamp}`;

    await pollInObsidian({
      input: { alphaBody, betaBody, folderName, sourcePath, stamp },
      poll({ app, folderName: folder, sourcePath: path, stamp: suffix }): boolean {
        return app.vault.getFileByPath(`${folder}/Alpha-${suffix}.md`) !== null
          && app.vault.getFileByPath(`${folder}/Beta-${suffix}.md`) !== null
          && app.vault.getFileByPath(path) !== null;
      },
      async start({ alphaBody: alpha, app, betaBody: beta, folderName: folder, lib: { createNote }, sourcePath: path, stamp: suffix }): Promise<void> {
        await app.vault.createFolder(folder);
        // `createNote` rather than `vault.create`: the preview is asserted on CONTENT, and Android loses a
        // fraction of plain `vault.create` writes.
        await createNote({ content: `${alpha}\n`, path: `${folder}/Alpha-${suffix}.md` });
        await createNote({ content: `${beta}\n`, path: `${folder}/Beta-${suffix}.md` });
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

    const hiddenBeforeToggle = await readPreview();

    await clickControl('Preview');
    await filterTo('Alpha-');
    const alphaPreview = await pollPreview('the pane never showed Alpha', (preview: PreviewReading): boolean => preview.text.includes(alphaBody));

    await filterTo('Beta-');
    const betaPreview = await pollPreview('the pane never followed the highlight to Beta', (preview: PreviewReading): boolean => preview.text.includes(betaBody));

    await chooseFirstRow();
    await pollPickerClosed('the picker never closed on the pick');

    expect(hiddenBeforeToggle.isShown).toBe(false);
    expect(alphaPreview.isShown).toBe(true);
    expect(alphaPreview.isPickerOpen).toBe(true);
    expect(betaPreview.text).not.toContain(alphaBody);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

interface PreviewReading {
  readonly isPickerOpen: boolean;
  readonly isShown: boolean;
  readonly text: string;
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
 * Focuses the search box and clicks a control, in ONE closure, so the picker cannot re-render between.
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
 * @param query - What to type.
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
 * Polls the preview pane until the Node-side predicate accepts it.
 *
 * @param message - What to say if it never does.
 * @param checkPreview - Whether a given reading is the one being waited for.
 * @returns The accepted reading.
 */
async function pollPreview(message: string, checkPreview: (preview: PreviewReading) => boolean): Promise<PreviewReading> {
  return await pollInObsidian({
    input: { previewSelector: PREVIEW_SELECTOR, promptSelector: PROMPT_SELECTOR },
    poll({ previewSelector, promptSelector }): PreviewReading {
      const el = document.querySelector(previewSelector);
      return {
        isPickerOpen: document.querySelector(promptSelector) !== null,
        isShown: el instanceof HTMLElement && el.isShown(),
        text: el?.textContent ?? ''
      };
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: message,
    until: checkPreview
  });
}

/**
 * Polls the picker's rows until the Node-side predicate accepts them.
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
 * Reads the preview pane once.
 *
 * @returns Whether it is shown and what it says.
 */
async function readPreview(): Promise<PreviewReading> {
  return await pollPreview('the preview pane could not be read', (): boolean => true);
}

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
 * The keyboard route, against a real Obsidian. Every behavior it reaches is also covered by clicking its
 * control, cross-platform — what only a key press can prove is that the key is CONSUMED.
 *
 * That is the regression this suite exists for: unconsumed, Obsidian typed the character as well as
 * running the handler, so `Alt + 1` closed the picker and then wrote `1` into the note being edited. A
 * click can never show that, and no unit test with a mocked scope can either.
 *
 * Desktop only, and deliberately: the harness drives keys through Electron's input API, which Android
 * has not got. The behaviors themselves are not desktop-only — their controls are tapped on a phone,
 * which is why the six suites that cover them are cross-platform.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, and this file declared six waits inside
 * one. What stays inside a closure is the key press itself, with the focus that has to precede it: the
 * trusted `pressKey` is a `lib` helper and only Obsidian holds it, and a re-render between the focus and
 * the press would send the key somewhere else.
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
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * Above the sum of the budgets used below, so a genuine stall reports the NAMED poll timeout rather than
 * losing the race to a bare vitest timeout.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

describe('A picker hotkey', () => {
  it('runs its handler and consumes the key, rather than also typing the digit', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const folderName = `Hotkeys-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { folderName, sourcePath, stamp },
      poll({ app, folderName: folder, sourcePath: path, stamp: suffix }): boolean {
        return app.vault.getFileByPath(`${folder}/Note-${suffix}.md`) !== null
          && app.vault.getFileByPath(`${folder}/Data-${suffix}.txt`) !== null
          && app.vault.getFileByPath(path) !== null;
      },
      async start({ app, folderName: folder, sourcePath: path, stamp: suffix }): Promise<void> {
        await app.vault.createFolder(folder);
        await app.vault.create(`${folder}/Note-${suffix}.md`, '# Note\n');
        await app.vault.create(`${folder}/Data-${suffix}.txt`, 'plain text');
        await app.vault.create(path, 'body');
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the staged files never appeared in the vault',
      until: (arePresent: boolean): boolean => arePresent
    });

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

    await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) === null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'a picker was left open by an earlier suite',
      until: (isClosed: boolean): boolean => isClosed
    });

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

    // Into the folder, so a toggle has something to change.
    await filterTo(folderName);
    await chooseFirstRow();
    await pollRows('the folder never opened', (rows: string[]): boolean => rows.some((text) => text.includes('Note-')));

    // `Alt + 2` shows the plain file.
    // If the key were not consumed, `2` would ALSO reach the search box and filter the list down to whatever contains a `2`.
    await pressHotkey('2');
    const rowsAfterToggle = await pollRows('the plain file was never offered', (rows: string[]): boolean => rows.some((text) => text.includes('Data-')));

    // `Alt + 1` closes the picker.
    // An unconsumed key then carries on to the editor that regains focus, and types `1` into the note.
    await pressHotkey('1');
    const wasPickerClosed = await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) === null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker never closed',
      until: (isClosed: boolean): boolean => isClosed
    });

    const editorText = await evalInObsidian({
      async callback({ app, obsidianModule, renderDelayInMilliseconds }): Promise<string> {
        await sleep(renderDelayInMilliseconds);
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '';
      },
      input: { renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS }
    });

    // The toggle ran, and the list was not additionally filtered by the digit.
    expect(rowsAfterToggle.join('\n')).toContain('Data-');
    expect(rowsAfterToggle.join('\n')).toContain('Note-');

    expect(wasPickerClosed).toBe(true);

    // The note is untouched: no link, and no stray `1`.
    expect(editorText).toBe('body');
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
        throw new TypeError('The folder was not offered.');
      }

      row.click();
    },
    input: { rowSelector: ROW_SELECTOR }
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
 * Focuses the search box and presses `Alt` plus a digit, in ONE closure.
 *
 * `pressKey` is the harness's TRUSTED press, reached through `lib` inside Obsidian, and it is the whole
 * point of this suite: a synthetic `KeyboardEvent` is untrusted, Obsidian may ignore it, and it could
 * never show whether the real key was consumed. The focus travels with it because a re-render landing
 * between the two would send the key somewhere else.
 *
 * @param digit - The digit pressed with `Alt`.
 */
async function pressHotkey(digit: string): Promise<void> {
  await evalInObsidian({
    async callback({ digit: key, inputSelector, lib: { pressKey } }): Promise<void> {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The picker has no input.');
      }

      input.focus();
      await pressKey({ key, modifiers: ['Alt'] });
    },
    input: { digit, inputSelector: INPUT_SELECTOR }
  });
}

/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs, driving a
 * staged vault in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * Two shots, because the plugin's value is two things and one frame cannot say
 * both: that the picker navigates by FOLDER, and that its ranking is ordered
 * rather than fuzzy. The first frame shows the picker rooted inside a folder
 * with the way out pinned above its contents; the second shows one query
 * putting four similarly-named notes in a fixed order.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM
 * reading.** A single `evalInObsidian` closure is capped at ~30s by the
 * transport, and `openPicker` declared five waits plus three settles inside one
 * of them. `pollInObsidian` is what makes each budget real: every poll is its
 * own short eval.
 *
 * Excluded from `npm run test:integration` by its file name — see the
 * `capture-screenshots:desktop` project in `scripts/vitest-config.ts`.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  pollInObsidian,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'link-picker';
const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * A render settle, short enough to sit inside an act closure without approaching the per-eval cap. Longer
 * than the functional suites use, because what these frames capture is the painted result rather than the
 * state behind it.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 900;

/**
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    'Legal/Courts/District Court.md': '# District Court\n',
    'Legal/Courts/Supreme Court.md': '# Supreme Court\n',
    'Legal/Filings/Statement of claim.md': '# Statement of claim\n',
    'Legal/Retainer.md': '# Retainer\n',
    'Ranking/Court.md': '# Court\n',
    'Ranking/Court of Appeal.md': '# Court of Appeal\n',
    'Ranking/Courtyard.md': '# Courtyard\n',
    'Ranking/District court records.md': '# District court records\n',
    'Source.md': '# Source\n\nPerson: \n'
  });
  await vault.syncToDevice();

  await pollInObsidian({
    poll({ app }): boolean {
      return app.vault.getFileByPath('Source.md') !== null;
    },
    start({ app }): void {
      app.changeTheme('obsidian');

      // The picker is the subject, not the file explorer, so the sidebar is collapsed to give the modal the frame.
      app.workspace.leftSplit.collapse();
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the staged note never became readable',
    until: (isPresent: boolean): boolean => isPresent,
    vaultPath: vaultPath()
  });

  await settle();
});

describe('desktop store screenshots', () => {
  it('1 - the picker rooted inside a folder', async () => {
    const rows = await openPicker({ folderQuery: 'Legal', query: '' });

    expect(rows.length).toBeGreaterThan(1);
    await shoot(1, 'Navigate folders instead of guessing names');
  });

  it('2 - the deterministic ranking', async () => {
    const rows = await openPicker({ folderQuery: 'Ranking', query: 'court' });

    expect(rows.length).toBeGreaterThan(1);
    await shoot(2, 'One query, one order — exact match first');
  });
});

interface OpenPickerParams {
  readonly folderQuery: string;
  readonly query: string;
}

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
    input: { rowSelector: ROW_SELECTOR },
    vaultPath: vaultPath()
  });
}

/**
 * Puts away whatever picker the previous shot left on screen.
 *
 * Each shot leaves its picker up — that is the point of the shot — so the next one has to close it
 * before opening its own. `Escape` travels through Electron's input API, which this desktop-only suite
 * has, so the press and the check that one is open stay in the same closure.
 */
async function closeAnyOpenPicker(): Promise<void> {
  const wasOpen = await evalInObsidian({
    async callback({ lib: { pressKey }, promptSelector }): Promise<boolean> {
      if (!document.querySelector(promptSelector)) {
        return false;
      }

      await pressKey({ key: 'Escape' });
      return true;
    },
    input: { promptSelector: PROMPT_SELECTOR },
    vaultPath: vaultPath()
  });

  if (!wasOpen) {
    return;
  }

  await pollInObsidian({
    input: { promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) === null;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the previous picker never closed',
    until: (isClosed: boolean): boolean => isClosed,
    vaultPath: vaultPath()
  });
}

/**
 * Types into the picker and waits for it to have something to show.
 *
 * @param text - What to type.
 */
async function filterTo(text: string): Promise<void> {
  await evalInObsidian({
    callback({ inputSelector, text: query }): void {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The picker has no input.');
      }

      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    input: { inputSelector: INPUT_SELECTOR, text },
    vaultPath: vaultPath()
  });

  await pollRows('no row was ever offered', (rows: string[]): boolean => rows.length > 0);
  await settle();
}

/**
 * Stops the text caret in the open picker from being drawn.
 *
 * The caret BLINKS, so two captures of the same state disagree on a 1px column whenever they land in
 * opposite halves of the blink — 20 pixels of `screenshot-desktop-2.png`, measured between two runs.
 * There is nothing to wait for, since the next blink undoes whatever the last one did, so the caret is
 * simply not painted. The field keeps its focus ring, which is what shows it has focus.
 *
 * Set on the element rather than through a stylesheet: a lint rule refuses a `style` element outright,
 * and this is presentation for one capture rather than something the plugin ships.
 */
async function hideCaret(): Promise<void> {
  await evalInObsidian({
    callback({ inputSelector }): void {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The picker has no input.');
      }

      input.setCssStyles({ caretColor: 'transparent' });
    },
    input: { inputSelector: INPUT_SELECTOR },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the picker, navigates into a folder, and leaves it on screen for the capture.
 *
 * @param params - The folder to navigate into, and what to type once inside it.
 * @returns The rows the picker is showing.
 */
async function openPicker(params: OpenPickerParams): Promise<string[]> {
  await closeAnyOpenPicker();

  await pollInObsidian({
    poll({ app }): string {
      return app.workspace.getActiveFile()?.path ?? '';
    },
    async start({ app }): Promise<void> {
      const source = app.vault.getFileByPath('Source.md');
      if (!source) {
        throw new Error('The staged note is missing.');
      }

      await app.workspace.getLeaf(false).openFile(source);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the staged note never opened',
    until: (path: string): boolean => path === 'Source.md',
    vaultPath: vaultPath()
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
    until: (isOpen: boolean): boolean => isOpen,
    vaultPath: vaultPath()
  });
  await settle();

  await filterTo(params.folderQuery);
  await chooseFirstRow();

  await pollRows('the folder never opened', (rows: string[]): boolean => rows.length > 1);
  await settle();

  if (params.query) {
    await filterTo(params.query);
  }

  await hideCaret();

  return await pollRows('the picker showed nothing to photograph', (rows: string[]): boolean => rows.length > 0);
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
    until: checkRows,
    vaultPath: vaultPath()
  });
}

/**
 * Lets the frame finish painting.
 *
 * A poll can only say that the state behind a frame has arrived, never that the pixels have — so these
 * shots keep an explicit settle, inside its own short closure.
 */
async function settle(): Promise<void> {
  await evalInObsidian({
    async callback({ settleDelayInMilliseconds }): Promise<void> {
      await sleep(settleDelayInMilliseconds);
    },
    input: { settleDelayInMilliseconds: SETTLE_DELAY_IN_MILLISECONDS },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

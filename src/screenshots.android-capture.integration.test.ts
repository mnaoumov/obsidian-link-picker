/**
 * @file
 *
 * Produces the mobile screenshots the community-store listing needs, driving the picker in Obsidian
 * Mobile on a real Android emulator and writing `images/screenshots/screenshot-mobile-N.png`.
 *
 * Two shots, the mobile half of the desktop pair, showing the same two things — that the picker navigates
 * by FOLDER, and that its ranking is ordered rather than fuzzy. They are not redundant with the desktop
 * frames: **the control strip is the picker's only affordance on a phone**, so the mobile frame shows an
 * interface the desktop one does not have. A desktop reader is told about `Alt + 3`; a phone reader has to
 * see the button, because there is no key to press.
 *
 * There is no mobile equivalent of the desktop viewport override, so the capture is always the device's
 * own framebuffer — which is why this runs on the `obsidian_screenshots` AVD, built at exactly the
 * 900x1600 the store asks for. See `scripts/vitest-config.ts` for why the shared `obsidian_test` AVD the
 * control-strip pass uses cannot stand in for it.
 *
 * **Each shot is taken with the soft keyboard up**, because that is what a phone looks like. The AVD has a
 * hardware keyboard attached, so Android suppresses the on-screen one and the picker's lower half used to
 * capture as ~700px of empty modal — 45 % of the frame, showing a void no user ever sees. Raising it takes
 * two things that are easy to miss, and both are load-bearing: the device setting, AND a real touch on the
 * field, since focus alone does not ask for an IME.
 *
 * **Both of those now come from the harness**, not from this file. `withSoftKeyboardEnabled` owns the
 * device setting and its exact restore (including restoring a setting that had never been written, which
 * takes a delete rather than a write); `raiseSoftKeyboard` owns the touch, the settle, the geometric
 * did-it-come-up test and the framebuffer diagnostic a failure leaves behind. This suite was where that
 * recipe was worked out by hand, so it is also the regression test for the shared version: its two frames
 * must come back materially unchanged.
 *
 * What deliberately stays here is the assertion that is about the PRODUCT rather than the keyboard —
 * every control-strip button still above the lifted field. The harness returns the geometry it decided on
 * and this suite judges the strip against it, because a keyboard that covered the strip would be a worse
 * frame than the empty band it replaced.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, and `openPicker` declared five waits plus
 * three settles inside one of them — 152.7 s of budget against a 30 s cap, on the slowest device this
 * repo drives. `pollInObsidian` is what makes each budget real: every poll is its own short eval.
 *
 * Excluded from `npm run test:integration` by its file name — see the `capture-screenshots:android`
 * project in `scripts/vitest-config.ts`. Capturing is an explicit operation (`npm run capture:screenshots`).
 */

import type {
  ElementRect,
  SoftKeyboardViewportSnapshot
} from 'obsidian-integration-testing';

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureDeviceScreenshot,
  evalInObsidian,
  labelScreenshot,
  pollInObsidian,
  raiseSoftKeyboard,
  readPngDimensions,
  resolveEmulatorDeviceId,
  withSoftKeyboardEnabled
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'link-picker';
const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

/**
 * The label on the control that ends the picker without writing anything.
 *
 * It is how each shot puts the previous picker away. The desktop suite presses `Escape` through Electron's
 * input API, which Android does not have — so this reaches for the product's own affordance instead, which
 * is the same thing a thumb would do.
 */
const DECLINE_CONTROL_LABEL = 'No link';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * The AVD these shots are taken on, matched by name.
 *
 * Never the first device `adb devices` lists: a physical phone is routinely plugged into the same machine,
 * and the other emulator is the 1344x2992 `obsidian_test` the control-strip pass drives.
 */
const AVD_NAME = 'obsidian_screenshots';

/**
 * The field the keyboard is raised by touching, which on a suggester is Obsidian's own prompt input.
 */
const INPUT_SELECTOR = '.prompt-input';

/**
 * The control strip's buttons, which are what the mobile frame exists to show.
 */
const CONTROL_SELECTOR = '.modal-command';

const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

/**
 * A render settle, short enough to sit inside an act closure without approaching the per-eval cap. Longer
 * than the functional suites use, because what these frames capture is the painted result rather than the
 * state behind it.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 900;

/**
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's. This is the
 * slowest device the repo drives, so it is also where the old shape failed hardest.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

let deviceId = '';

beforeAll(async () => {
  deviceId = await resolveEmulatorDeviceId({ avdName: AVD_NAME });

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

  // No sidebar to collapse, unlike the desktop suite.
  // On a phone the sidebar is a drawer that is already closed, and the picker is a full-screen modal over whatever is behind it.
  await pollInObsidian({
    poll({ app }): boolean {
      return app.vault.getFileByPath('Source.md') !== null;
    },
    start({ app }): void {
      app.changeTheme('obsidian');
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the staged note never became readable',
    until: (isPresent: boolean): boolean => isPresent,
    vaultPath: vaultPath()
  });

  await settle();
});

describe('mobile store screenshots', () => {
  it('1 - the picker rooted inside a folder', async () => {
    // The wrapper spans the whole shot, so the setting is live before the picker's field takes focus and
    // The device is put back exactly as it was found even if the capture throws.
    await withSoftKeyboardEnabled({
      async callback() {
        const rows = await openPicker({ folderQuery: 'Legal', query: '' });

        expect(rows.length).toBeGreaterThan(1);
        await shoot(1, 'Navigate folders with a tap — no hotkeys needed');
      },
      deviceId
    });
  });

  it('2 - the deterministic ranking', async () => {
    await withSoftKeyboardEnabled({
      async callback() {
        const rows = await openPicker({ folderQuery: 'Ranking', query: 'court' });

        expect(rows.length).toBeGreaterThan(1);
        // The caption names the ORDER rather than the query. The query is legible now — raising the
        // Keyboard lifted the field clear of the caption band, which used to cover it — but the four
        // Ranked rows are what the shot is evidence FOR, and the query is only the input that produced
        // Them.
        await shoot(2, 'Exact match first, then prefix, then the rest');
      },
      deviceId
    });
  });
});

interface OpenPickerParams {
  readonly folderQuery: string;
  readonly query: string;
}

/**
 * Taps whatever the picker is leading with, through the harness's trusted click.
 */
async function chooseFirstRow(): Promise<void> {
  await evalInObsidian({
    async callback({ lib: { clickElement }, rowSelector }): Promise<void> {
      const folderRow = document.querySelector(rowSelector);
      if (!(folderRow instanceof HTMLElement)) {
        throw new TypeError('The folder was not offered.');
      }

      await clickElement({ element: folderRow });
    },
    input: { rowSelector: ROW_SELECTOR },
    vaultPath: vaultPath()
  });
}

/**
 * Puts away whatever picker the previous shot left on screen.
 *
 * Each shot leaves its picker up — that is the point of the shot — so the next one has to close it before
 * opening its own. The desktop suite presses `Escape` through Electron's input API, which Android does not
 * have, so this reaches for the product's own affordance instead: the same thing a thumb would do.
 */
async function closeAnyOpenPicker(): Promise<void> {
  const wasOpen = await evalInObsidian({
    async callback({ controlSelector, declineControlLabel, lib: { clickElement }, promptSelector }): Promise<boolean> {
      if (!document.querySelector(promptSelector)) {
        return false;
      }

      const declineControl = [...document.querySelectorAll(controlSelector)]
        .find((el) => el.querySelector('span')?.textContent === declineControlLabel);
      if (!(declineControl instanceof HTMLElement)) {
        throw new TypeError(`The previous picker has no ${declineControlLabel} control to close it with.`);
      }

      await clickElement({ element: declineControl });
      return true;
    },
    input: {
      controlSelector: CONTROL_SELECTOR,
      declineControlLabel: DECLINE_CONTROL_LABEL,
      promptSelector: PROMPT_SELECTOR
    },
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
 * Proves the control strip survived the keyboard coming up.
 *
 * The whole point of a mobile frame is the strip — it is the picker's only affordance on a phone — so a
 * keyboard that covered it would be a worse frame than the empty band it replaced. The strip sits above
 * the field, and the field is now above the keyboard, so a strip above the field is a strip in the clear.
 *
 * @param snapshot - The geometry the harness settled on once the keyboard was up.
 */
async function expectControlStripClearOfKeyboard(snapshot: SoftKeyboardViewportSnapshot): Promise<void> {
  const raisedInputRect = snapshot.inputRect;
  if (!raisedInputRect) {
    throw new Error('The picker closed while the keyboard was coming up.');
  }

  const controlRects = await readControlRects();

  expect(controlRects.length).toBeGreaterThan(0);
  for (const rect of controlRects) {
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top + rect.height).toBeLessThanOrEqual(raisedInputRect.top);
  }
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
 * Reads where the control strip's buttons are, in CSS pixels.
 *
 * Separate from the harness's own geometry read because the strip is this plugin's affordance, not
 * something every soft-keyboard suite has.
 *
 * @returns One rect per button, in the order the strip renders them.
 */
async function readControlRects(): Promise<ElementRect[]> {
  return await evalInObsidian({
    callback({ controlSelector }): ElementRect[] {
      return [...document.querySelectorAll(controlSelector)].map((el) => {
        const rect = el.getBoundingClientRect();

        return {
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width
        };
      });
    },
    input: { controlSelector: CONTROL_SELECTOR },
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
 * Captures the device framebuffer, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const snapshot = await raiseSoftKeyboard({
    deviceId,
    inputSelector: INPUT_SELECTOR,
    vaultPath: vaultPath()
  });
  await expectControlStripClearOfKeyboard(snapshot);

  // The DEVICE's framebuffer, not the harness's screenshot. `captureObsidianScreenshot` goes through
  // Appium in the WebView context, so it photographs the web page: no status bar, and — the reason this
  // Suite cannot use it — no keyboard, because the IME is a system window and not part of the page.
  const bytes = await captureDeviceScreenshot({ deviceId });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

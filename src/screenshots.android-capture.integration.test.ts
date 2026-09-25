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
 * did-it-come-up test, the framebuffer diagnostic a failure leaves behind, AND the emptying of the field
 * the touch lands in. This suite was where that whole recipe was worked out by hand, so it is also the
 * regression test for the shared version: its two frames must come back BYTE-identical, and do.
 *
 * What deliberately stays here is the assertion that is about the PRODUCT rather than the keyboard —
 * every control-strip button still above the lifted field. The harness returns the geometry it decided on
 * and this suite judges the strip against it, because a keyboard that covered the strip would be a worse
 * frame than the empty band it replaced.
 *
 * **These frames are BYTE-REPRODUCIBLE, and staying that way took three separate answers** — each one
 * found by capturing twice and diffing, not by reasoning. A framebuffer carries the status bar, and a
 * status bar carries a wall clock, a battery that charges while the emulator runs and a radio that comes
 * and goes, so re-running this suite on an unchanged tree used to rewrite both PNGs with content nobody
 * could commit. The band is therefore PAINTED OUT (the harness's `paintOutStatusBar`, given the height
 * this AVD measures) rather than pinned: SystemUI's demo mode held the clock at a fixed `12:00` and two
 * runs still disagreed on 1823 full-contrast pixels, because the bar's leading group is laid out at a
 * different offset between emulator boots. The keyboard is raised while the field is EMPTY (the harness's
 * `shouldEmptyFieldForTouch`, on by default), because the touch that raises it draws Chromium's selection
 * handle when it lands inside text — which is how shot 2 shipped a teal handle twice. And the caret is not
 * painted at all (`hideCaret`), because it blinks and no settle can outwait a blink. Only the last of the
 * three is still this file's: the caret is a presentation choice about THIS picker, where the other two
 * are true of any device capture.
 *
 * **So a re-capture that changes a PNG is a real change, and worth reading as one.** Prove it the way it
 * was proved here: capture twice and compare the two frames byte for byte.
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
  paintOutStatusBar,
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

/**
 * How tall the device's status bar is, in framebuffer pixels.
 *
 * The harness deliberately has no default for this, because a wrong height paints over the product rather
 * than failing: it is one AVD's measurement, not a constant of Android. 24dp at this AVD's density 320,
 * and measured rather than assumed — the bar's own content occupies rows 8 to 37 of the frame, rows 38 to
 * 47 are empty, and Obsidian's top chrome starts at exactly row 48. `paintOutStatusBar`'s own
 * clear-of-chrome check fails the capture if that ever stops being true, so this number cannot go stale
 * quietly; the sample inset and edge margin it reads the band with are the harness's defaults, which are
 * the 4px and 100px this file used to declare for itself.
 */
const STATUS_BAR_HEIGHT_IN_PIXELS = 48;

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
    // the device is put back exactly as it was found even if the capture throws.
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
        // keyboard lifted the field clear of the caption band, which used to cover it — but the four
        // ranked rows are what the shot is evidence FOR, and the query is only the input that produced
        // them.
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
 * **The two rectangles are read on opposite sides of the harness's write-back**, and that is safe here for
 * the same reason the lift test works at all: both the field and the strip are anchored to the BOTTOM of
 * the modal, above the keyboard. What the restored query changes is the number of rows above them, not
 * where they sit. A picker that ever anchored them to its content instead would need this read again after
 * the restore, which is exactly what `raiseSoftKeyboard` warns about.
 *
 * @param snapshot - The geometry the harness settled on once the keyboard was up, read with the field
 * empty for the touch.
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
 * Stops the text caret in the open picker from being drawn.
 *
 * The caret BLINKS, so two captures of the same state disagree on a 2px column whenever they land in
 * opposite halves of the blink — 76 pixels at full contrast, measured between two runs of this suite.
 * There is nothing to wait for, since the next blink undoes whatever the last one did, so the caret is
 * simply not painted. The keyboard standing open is what shows the field has focus, and it is in frame.
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
  await hideCaret();

  // `raiseSoftKeyboard` empties the field for the touch and writes the query back afterwards — the touch
  // That raises the IME puts Chromium's handle under the caret when it lands inside TEXT, and the
  // Framebuffer photographs it, which is how shot 2 shipped a teal handle and shot 1 (empty field) did not.
  // The geometry it returns is read with the field still EMPTY, which is the state
  // `expectControlStripClearOfKeyboard` has always asserted against: the strip is above the field either way.
  const snapshot = await raiseSoftKeyboard({
    deviceId,
    inputSelector: INPUT_SELECTOR,
    vaultPath: vaultPath()
  });
  await expectControlStripClearOfKeyboard(snapshot);

  // The write-back tells the page its query is there again, but says nothing about the rows the suggester
  // Re-renders off it. The frame is the painted result, so it waits for the paint rather than for a state.
  await settle();

  // The DEVICE's framebuffer, not the harness's screenshot. `captureObsidianScreenshot` goes through
  // appium in the WebView context, so it photographs the web page: no status bar, and — the reason this
  // suite cannot use it — no keyboard, because the IME is a system window and not part of the page.
  const bytes = await captureDeviceScreenshot({ deviceId });

  const labeled = await labelScreenshot(
    await paintOutStatusBar(bytes, { heightInPixels: STATUS_BAR_HEIGHT_IN_PIXELS }),
    { text: caption }
  );

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

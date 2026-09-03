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
 * Excluded from `npm run test:integration` by its file name — see the `capture-screenshots:android`
 * project in `scripts/vitest-config.ts`. Capturing is an explicit operation (`npm run capture:screenshots`).
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
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
 * Where a failed capture leaves its evidence — gitignored, like the control-strip frames.
 */
const DIAGNOSTICS_DIRECTORY = join(process.cwd(), 'dist', 'screenshots');
const SCREENCAP_BUFFER_SIZE_IN_BYTES = 64 * 1024 * 1024;

/**
 * The AVD these shots are taken on, matched by name.
 *
 * Never the first device `adb devices` lists: a physical phone is routinely plugged into the same machine,
 * and the other emulator is the 1344x2992 `obsidian_test` the control-strip pass drives.
 */
const AVD_NAME = 'obsidian_screenshots';

/**
 * The setting that decides whether Android draws a keyboard while a hardware one is attached.
 *
 * The AVD is built `hw.keyboard=yes`, so Android suppresses the on-screen keyboard and the picker's lower
 * half captures as an empty band — roughly 45 % of the frame. On a phone that band is the IME. Raising it
 * for the shots makes the frame honest about the experience rather than only about the DOM.
 */
const SOFT_KEYBOARD_SETTING_NAME = 'show_ime_with_hard_keyboard';
const SOFT_KEYBOARD_SETTING_NAMESPACE = 'secure';
const SOFT_KEYBOARD_SETTING_ON = '1';

/**
 * What `settings get` prints for a setting that has never been written.
 */
const UNSET_SETTING_VALUE = 'null';

/**
 * How long the IME takes to finish animating in, after which the layout has settled.
 */
const KEYBOARD_SETTLE_DELAY_IN_MILLISECONDS = 1500;

/**
 * The least a raised keyboard lifts the search field by, so a stray rounding pixel is not read as one.
 */
const KEYBOARD_MINIMUM_HEIGHT_IN_PIXELS = 100;

let deviceId = '';
let softKeyboardSettingBeforeCapture = '';

beforeAll(async () => {
  // Before the first picker opens, so the setting is live by the time the search field takes focus.
  deviceId = resolveEmulatorId();
  softKeyboardSettingBeforeCapture = readDeviceSetting(deviceId, SOFT_KEYBOARD_SETTING_NAME);
  writeDeviceSetting(deviceId, SOFT_KEYBOARD_SETTING_NAME, SOFT_KEYBOARD_SETTING_ON);

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

  await evalInObsidian({
    async callback({ app, lib: { waitUntil } }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      // No sidebar to collapse, unlike the desktop suite.
      // On a phone the sidebar is a drawer that is already closed, and the picker is a full-screen modal
      // Over whatever is behind it.
      await waitUntil({
        message: 'the staged note to be readable',
        predicate: () => app.vault.getFileByPath('Source.md') !== null,
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    vaultPath: vaultPath()
  });
});

afterAll(() => {
  if (!deviceId) {
    return;
  }

  // Restore exactly what was there — including having been unset, which `settings put null` would not
  // Reproduce.
  if (softKeyboardSettingBeforeCapture === UNSET_SETTING_VALUE) {
    deleteDeviceSetting(deviceId, SOFT_KEYBOARD_SETTING_NAME);
    return;
  }

  writeDeviceSetting(deviceId, SOFT_KEYBOARD_SETTING_NAME, softKeyboardSettingBeforeCapture);
});

describe('mobile store screenshots', () => {
  it('1 - the picker rooted inside a folder', async () => {
    const rows = await openPicker({ folderQuery: 'Legal', query: '' });

    expect(rows.length).toBeGreaterThan(1);
    await shoot(1, 'Navigate folders with a tap — no hotkeys needed');
  });

  it('2 - the deterministic ranking', async () => {
    const rows = await openPicker({ folderQuery: 'Ranking', query: 'court' });

    expect(rows.length).toBeGreaterThan(1);
    // The caption names the ORDER rather than the query. The query is legible now — raising the keyboard
    // Lifted the field clear of the caption band, which used to cover it — but the four ranked rows are
    // What the shot is evidence FOR, and the query is only the input that produced them.
    await shoot(2, 'Exact match first, then prefix, then the rest');
  });
});

interface ElementRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface OpenPickerParams {
  readonly folderQuery: string;
  readonly query: string;
}

interface ViewportSnapshot {
  readonly activeElementClassName: string;
  readonly controlRects: ElementRect[];
  readonly devicePixelRatio: number;
  readonly innerHeight: number;
  /**
   * The search field's rect, which is what says whether the keyboard is up.
   *
   * Nothing else moves. `innerHeight`, `visualViewport` and even `.prompt` all stay at the full 800 with
   * the keyboard shown and `dumpsys input_method` reporting `mInputShown=true` — Obsidian Mobile keeps a
   * full-screen container and lifts its contents inside it. The field sits at the bottom of the picker, so
   * how far it has been lifted off the bottom IS the keyboard's height.
   */
  readonly inputRect: ElementRect | null;
  readonly screenY: number;
}

/**
 * Clears a device setting, returning it to never-having-been-written.
 *
 * @param id - The device to write to.
 * @param name - The setting's name within {@link SOFT_KEYBOARD_SETTING_NAMESPACE}.
 */
function deleteDeviceSetting(id: string, name: string): void {
  execFileSync('adb', ['-s', id, 'shell', 'settings', 'delete', SOFT_KEYBOARD_SETTING_NAMESPACE, name]);
}

/**
 * Writes what the device was showing when the keyboard failed to come up, and says what the page saw.
 *
 * @param snapshot - The geometry read after the last touch.
 */
function dumpKeyboardDiagnostic(snapshot: ViewportSnapshot): void {
  mkdirSync(DIAGNOSTICS_DIRECTORY, { recursive: true });
  const path = join(DIAGNOSTICS_DIRECTORY, 'keyboard-not-raised.png');
  writeFileSync(path, execFileSync('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'], { maxBuffer: SCREENCAP_BUFFER_SIZE_IN_BYTES }));

  const inputMethodState = execFileSync('adb', ['-s', deviceId, 'shell', 'dumpsys', 'input_method'], { encoding: 'utf-8' })
    .split('\n')
    .filter((line) => /mInputShown|mIsInputViewShown|mHaveConnection|mShowRequested/.test(line))
    .map((line) => line.trim())
    .join(' | ');

  console.error([
    `The keyboard did not come up. Device framebuffer written to ${path}.`,
    `page: innerHeight=${String(snapshot.innerHeight)} inputBottom=${String(snapshot.inputRect ? snapshot.inputRect.top + snapshot.inputRect.height : -1)} activeElement=${snapshot.activeElementClassName}`,
    `device: ${inputMethodState}`
  ].join('\n'));
}

/**
 * Decides whether the IME is up, from the page's own geometry.
 *
 * @param snapshot - The geometry to judge.
 * @returns Whether the modal has stopped short of the screen bottom to make room for a keyboard.
 */
function isKeyboardUp(snapshot: ViewportSnapshot): boolean {
  if (!snapshot.inputRect) {
    return false;
  }

  return snapshot.innerHeight - (snapshot.inputRect.top + snapshot.inputRect.height) > KEYBOARD_MINIMUM_HEIGHT_IN_PIXELS;
}

/**
 * Opens the picker, navigates into a folder, and leaves it on screen for the capture.
 *
 * @param params - The folder to navigate into, and what to type once inside it.
 * @returns The rows the picker is showing.
 */
async function openPicker(params: OpenPickerParams): Promise<string[]> {
  return await evalInObsidian({
    async callback({ app, declineControlLabel, folderQuery, lib: { waitUntil }, pluginId, query }) {
      const TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;

      // Each shot leaves its picker on screen — that is the point of the shot — so the next one has to
      // Put it away before opening its own.
      if (document.querySelector('.prompt')) {
        const declineControl = [...document.querySelectorAll('.modal-command')]
          .find((el) => el.querySelector('span')?.textContent === declineControlLabel);
        if (!(declineControl instanceof HTMLElement)) {
          throw new TypeError(`The previous picker has no ${declineControlLabel} control to close it with.`);
        }
        declineControl.click();

        await waitUntil({
          message: 'the previous picker to close',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
      }

      const source = app.vault.getFileByPath('Source.md');
      if (!source) {
        throw new Error('The staged note is missing.');
      }

      await app.workspace.getLeaf(false).openFile(source);
      await waitUntil({
        message: 'the staged note to be open',
        predicate: () => app.workspace.getActiveFile()?.path === 'Source.md',
        timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
      });

      app.commands.executeCommandById(`${pluginId}:insert-link`);
      await waitUntil({
        message: 'the picker to open',
        predicate: () => document.querySelector('.prompt') !== null,
        timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
      });
      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      await filterTo(folderQuery);
      const folderRow = document.querySelector('.suggestion-item');
      if (!(folderRow instanceof HTMLElement)) {
        throw new TypeError('The folder was not offered.');
      }
      folderRow.click();

      await waitUntil({
        message: 'the folder to open',
        predicate: () => rows().length > 1,
        timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
      });
      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      if (query) {
        await filterTo(query);
      }

      return rows();

      async function filterTo(text: string): Promise<void> {
        const input = document.querySelector('.prompt-input');
        if (!(input instanceof HTMLInputElement)) {
          throw new TypeError('The picker has no input.');
        }
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await waitUntil({
          message: 'a row to be offered',
          predicate: () => document.querySelector('.suggestion-item') !== null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
        await sleep(SETTLE_DELAY_IN_MILLISECONDS);
      }

      function rows(): string[] {
        return [...document.querySelectorAll('.suggestion-item')].map((el) => el.textContent);
      }
    },
    input: {
      declineControlLabel: DECLINE_CONTROL_LABEL,
      folderQuery: params.folderQuery,
      pluginId: PLUGIN_ID,
      query: params.query
    },
    vaultPath: vaultPath()
  });
}

/**
 * Raises the on-screen keyboard with a real touch on the search field, and proves the strip survived it.
 *
 * {@link SOFT_KEYBOARD_SETTING_NAME} alone is not enough. The picker's field takes focus programmatically,
 * and an Android WebView does not ask for the IME without a gesture behind it — a first run with the
 * setting flipped and no touch came back with the same empty band it had before. `adb shell input tap` is
 * that gesture, and it is the same OS-level touch the control-strip pass drives the picker with.
 */
async function raiseKeyboard(): Promise<void> {
  let snapshot = await readViewport();
  if (!snapshot.inputRect) {
    throw new Error('The picker has no input to touch.');
  }

  const centerXInPixels = Math.round((snapshot.inputRect.left + snapshot.inputRect.width / 2) * snapshot.devicePixelRatio);
  const centerYInPixels = Math.round((snapshot.inputRect.top + snapshot.inputRect.height / 2) * snapshot.devicePixelRatio);

  // The WebView may or may not start at the top of the screen, and the page cannot tell which. Both
  // Candidates land inside the field — it is taller than the offset — so a miss costs a touch, not a
  // Mis-tap on a suggestion row.
  const candidateTopOffsetsInPixels = [Math.round(snapshot.screenY * snapshot.devicePixelRatio), 0];

  for (const topOffsetInPixels of candidateTopOffsetsInPixels) {
    if (isKeyboardUp(snapshot)) {
      break;
    }

    execFileSync('adb', [
      '-s',
      deviceId,
      'shell',
      'input',
      'tap',
      String(centerXInPixels),
      String(centerYInPixels + topOffsetInPixels)
    ]);
    await sleepOnHost(KEYBOARD_SETTLE_DELAY_IN_MILLISECONDS);
    snapshot = await readViewport();
  }

  if (!isKeyboardUp(snapshot)) {
    // A blind failure here is unreadable — the interesting evidence is what the device was showing.
    dumpKeyboardDiagnostic(snapshot);
  }

  expect(isKeyboardUp(snapshot)).toBe(true);

  // The whole point of a mobile frame is the strip — it is the picker's only affordance on a phone — so a
  // Keyboard that covered it would be a worse frame than the empty band it replaced. The strip sits above
  // The field, and the field is now above the keyboard, so a strip above the field is a strip in the clear.
  const raisedInputRect = snapshot.inputRect;
  if (!raisedInputRect) {
    throw new Error('The picker closed while the keyboard was coming up.');
  }

  expect(snapshot.controlRects.length).toBeGreaterThan(0);
  for (const rect of snapshot.controlRects) {
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top + rect.height).toBeLessThanOrEqual(raisedInputRect.top);
  }
}

/**
 * Reads a device setting.
 *
 * @param id - The device to read from.
 * @param name - The setting's name within {@link SOFT_KEYBOARD_SETTING_NAMESPACE}.
 * @returns The setting's value, or {@link UNSET_SETTING_VALUE} when it has never been written.
 */
function readDeviceSetting(id: string, name: string): string {
  return execFileSync('adb', ['-s', id, 'shell', 'settings', 'get', SOFT_KEYBOARD_SETTING_NAMESPACE, name], { encoding: 'utf-8' }).trim();
}

/**
 * Reads what the renderer knows about its own geometry.
 *
 * @returns The viewport, the search field and the strip's controls, in CSS pixels.
 */
async function readViewport(): Promise<ViewportSnapshot> {
  return await evalInObsidian({
    callback(): ViewportSnapshot {
      const inputEl = document.querySelector('.prompt-input');

      return {
        activeElementClassName: document.activeElement?.className ?? '',
        controlRects: [...document.querySelectorAll('.modal-command')].map((el) => toRect(el.getBoundingClientRect())),
        devicePixelRatio: window.devicePixelRatio,
        innerHeight: window.innerHeight,
        inputRect: inputEl ? toRect(inputEl.getBoundingClientRect()) : null,
        screenY: window.screenY
      };

      function toRect(rect: DOMRect): ElementRect {
        return {
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width
        };
      }
    },
    vaultPath: vaultPath()
  });
}

/**
 * Finds the running emulator whose AVD is {@link AVD_NAME}.
 *
 * @returns The device id to address it by.
 */
function resolveEmulatorId(): string {
  const listed = execFileSync('adb', ['devices'], { encoding: 'utf-8' })
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split('\t', 1)[0] ?? '')
    .filter((id) => id.startsWith('emulator-'));

  for (const id of listed) {
    const name = execFileSync('adb', ['-s', id, 'emu', 'avd', 'name'], { encoding: 'utf-8' }).split('\n', 1)[0]?.trim();
    if (name === AVD_NAME) {
      return id;
    }
  }

  throw new Error(`No running emulator for AVD "${AVD_NAME}". Start it, or run this project once to have the harness start it.`);
}

/**
 * Captures the device framebuffer, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  await raiseKeyboard();

  // The DEVICE's framebuffer, not the harness's screenshot. `captureObsidianScreenshot` goes through
  // Appium in the WebView context, so it photographs the web page: no status bar, and — the reason this
  // Suite cannot use it — no keyboard, because the IME is a system window and not part of the page.
  const bytes = execFileSync('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'], { maxBuffer: SCREENCAP_BUFFER_SIZE_IN_BYTES });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

/**
 * Waits on the HOST, not in the renderer.
 *
 * A bare `setTimeout` here typechecks and then throws — `lint:fix` rewrites it to `window.setTimeout`, and
 * this half runs in Node.
 *
 * @param milliseconds - How long to wait.
 */
async function sleepOnHost(milliseconds: number): Promise<void> {
  await delay(milliseconds);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

/**
 * Writes a device setting.
 *
 * @param id - The device to write to.
 * @param name - The setting's name within {@link SOFT_KEYBOARD_SETTING_NAMESPACE}.
 * @param value - The value to write.
 */
function writeDeviceSetting(id: string, name: string, value: string): void {
  execFileSync('adb', ['-s', id, 'shell', 'settings', 'put', SOFT_KEYBOARD_SETTING_NAMESPACE, name, value]);
}

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
 * Opens the picker, navigates into a folder, and leaves it on screen for the capture.
 *
 * @param params - The folder to navigate into, and what to type once inside it.
 * @returns The rows the picker is showing.
 */
async function openPicker(params: OpenPickerParams): Promise<string[]> {
  return await evalInObsidian({
    async callback({ app, declineControlLabel, folderQuery, lib: { clickElement, waitUntil }, pluginId, query }) {
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
        await clickElement({ element: declineControl });

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
      await clickElement({ element: folderRow });

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

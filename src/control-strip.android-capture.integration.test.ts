/**
 * @file
 *
 * The control-strip pass on Android, driven by REAL touches.
 *
 * `T756-P44` held this open as "a manual pass on a phone", because three things about the strip cannot be
 * settled from desktop: that it is reachable and legible on a small screen, that a control's `mousedown`
 * `preventDefault` really does keep the search alive under a finger, and that an unavailable control reads
 * as disabled rather than missing.
 *
 * The first is answered by a captured frame a human looks at. The other two are answered HERE, and only
 * here, because every other suite reaches a control through `HTMLElement.click()`. A synthetic click
 * dispatches no `mousedown`, so it cannot show what `preventDefault` prevents. `adb shell input tap`
 * injects an OS-level touch that Android turns into the same event sequence a finger produces — the one
 * case where going outside the page is the only way to test what the page does.
 *
 * Excluded from `npm run test:integration` by its file name — `*.android-capture.` matches none of the
 * standard project globs, exactly as `*.desktop-capture.` does for the screenshot suites. Capturing is an
 * explicit operation (`npm run capture:control-strip`), not something every run does: it needs an emulator,
 * it writes PNGs, and it takes minutes.
 *
 * `screenshots.android-capture.integration.test.ts` shares that suffix, so the two are told apart by the
 * FILE half of their vitest `include` globs rather than by the suffix — see `scripts/vitest-config.ts`.
 * They also want different devices: this pass drives the shared `obsidian_test` AVD, the listing shots the
 * 900x1600 `obsidian_screenshots` one.
 *
 * The frames here are evidence for the release gate, NOT listing material: they are full-screen device
 * captures of intermediate states, several of which exist to show a control DISABLED. They land in
 * `dist/`, which is gitignored. The listing's own mobile frames are the other suite's job.
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'link-picker';

/**
 * The AVD the `integration-tests:android` project already uses. Matched by NAME rather than by taking the
 * first device `adb` lists, so a physical phone plugged into the same machine can never be driven by this
 * suite.
 */
const AVD_NAME = 'obsidian_test';

const CAPTURE_DIRECTORY = join(process.cwd(), 'dist', 'control-strip');

/**
 * Long, because every step is a round trip out to `adb` and back into the renderer.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 600_000;

/**
 * Android turns a tap into a touch sequence, then a synthesized mouse sequence, then a click. Obsidian
 * re-renders off the last of those, so a snapshot taken immediately after the tap can read the state from
 * before it.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 900;

/**
 * The six labels, in the order `buildControls` declares them: the two actions, then the four toggles.
 */
const CONTROL_LABELS = ['No link', 'Create new', 'All files', 'Subfolders', 'Folders only', 'By date'];

const PREFIX = 'Person: ';

/**
 * The picker is pointed at a folder rather than at the vault root, so the frames show what the plugin is
 * actually for — a scoped list with the way out (`..`) pinned above it.
 */
const FOLDER_PATH = 'People';

/**
 * The shapes the two closures read the registry and the stashed answer through. Type-only, so none of it
 * crosses into the renderer at runtime — which is why they can sit at module scope while every VALUE a
 * closure needs still has to arrive through `input`.
 */
interface ApiLike {
  select(params: Record<string, unknown>): Promise<string>;
}

interface CaptureWindow {
  __linkPickerCapture?: LinkBag;
  readonly __obsidianDevUtils?: Record<string, StateEntryLike | undefined>;
}

interface ControlSnapshot {
  readonly hasHotkeyHint: boolean;
  readonly isDisabled: boolean;
  readonly isPressed: boolean;
  readonly label: string;
  readonly rect: RectSnapshot;
}

/**
 * Where the picker's answer waits. `select` settles long after the call that opened the picker has
 * returned to the host, so the string is stashed on the page and read back once a control has ended it.
 */
interface LinkBag {
  link: null | string;
  pending?: Promise<void>;
}

interface RecordLike {
  readonly api: ApiLike;
  readonly isRevoked: boolean;
}

interface RectSnapshot {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface RegistryLike {
  readonly records: Record<string, RecordLike[] | undefined>;
}

interface StateEntryLike {
  readonly value?: RegistryLike;
}

interface StripSnapshot {
  readonly controls: ControlSnapshot[];
  readonly isInputFocused: boolean;
  readonly isPickerOpen: boolean;
  readonly link: null | string;
  readonly queryText: string;
  readonly suggestionCount: number;
  readonly viewport: ViewportSnapshot;
}

interface ViewportSnapshot {
  readonly devicePixelRatio: number;
  readonly innerHeight: number;
  readonly innerWidth: number;
  readonly screenY: number;
}

describe('The control strip, under a real finger on Android', () => {
  it('is reachable, keeps the search alive, disables rather than hides, and runs all six behaviors', async () => {
    mkdirSync(CAPTURE_DIRECTORY, { recursive: true });
    const deviceId = resolveEmulatorId();

    await seedVault();
    await openPicker();
    let snapshot = await readStrip();

    expect(snapshot.isPickerOpen).toBe(true);
    expect(snapshot.controls.map((control) => control.label)).toEqual(CONTROL_LABELS);

    // Reachable, stated as a number rather than as an impression: every control lies inside the viewport,
    // Which is the thing a small screen puts at risk.
    for (const control of snapshot.controls) {
      expect(control.rect.width).toBeGreaterThan(0);
      expect(control.rect.top).toBeGreaterThanOrEqual(0);
      expect(control.rect.top + control.rect.height).toBeLessThanOrEqual(snapshot.viewport.innerHeight);
    }

    // The strip is the picker's only affordance on a phone, so it must not be spending that width on keys
    // Nobody can press. `renderControls` suppresses the hint on mobile; this is where that is confirmed on
    // A device rather than against a mocked `Platform`.
    for (const control of snapshot.controls) {
      expect(control.hasHotkeyHint).toBe(false);
    }

    expect(snapshot.suggestionCount).toBeGreaterThan(0);
    capture(deviceId, '01-strip');

    // Which vertical offset maps a CSS rectangle onto the touchscreen is not knowable from inside the
    // Page, so it is measured rather than assumed — see `calibrate`.
    const topOffsetInDevicePixels = await calibrate(deviceId, snapshot);

    // `Folders only` on: the two controls it would empty the list with must go DISABLED, and must still be
    // There. Removing them would reflow the strip under the finger that is still on it.
    await tapControl(deviceId, snapshot, 'Folders only', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(findControl(snapshot, 'Folders only').isPressed).toBe(true);
    expect(findControl(snapshot, 'All files').isDisabled).toBe(true);
    expect(findControl(snapshot, 'Subfolders').isDisabled).toBe(true);
    expect(snapshot.controls).toHaveLength(CONTROL_LABELS.length);
    capture(deviceId, '02-folders-only-disables');

    await tapControl(deviceId, snapshot, 'Folders only', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(findControl(snapshot, 'Folders only').isPressed).toBe(false);
    expect(findControl(snapshot, 'All files').isDisabled).toBe(false);

    // The query is typed through the emulator's input method, not assigned to the field — so what follows
    // Is a real search, in the state a finger would leave it in.
    const query = 'Ada';
    typeText(deviceId, query);
    await sleepOnHost(SETTLE_DELAY_IN_MILLISECONDS);
    snapshot = await readStrip();
    expect(snapshot.queryText).toBe(query);
    expect(snapshot.isInputFocused).toBe(true);
    capture(deviceId, '03-query-typed');

    // THE `preventDefault` PROOF. A touch on a control is a `mousedown` on something that is not the
    // Search field; without the handler's `preventDefault` the field loses focus, and a search in progress
    // Ends mid-word. Only a real touch can show this — `click()` never dispatches the `mousedown`.
    await tapControl(deviceId, snapshot, 'Subfolders', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(findControl(snapshot, 'Subfolders').isPressed).toBe(true);
    expect(snapshot.queryText).toBe(query);
    expect(snapshot.isInputFocused).toBe(true);
    capture(deviceId, '04-search-survives-a-touch');

    await tapControl(deviceId, snapshot, 'All files', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(findControl(snapshot, 'All files').isPressed).toBe(true);
    expect(snapshot.queryText).toBe(query);

    // On by default, so this one proves a touch can turn a toggle OFF as well as on.
    await tapControl(deviceId, snapshot, 'By date', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(findControl(snapshot, 'By date').isPressed).toBe(false);
    capture(deviceId, '05-toggles');

    // `Create new` — the first of the two ACTIONS, which end the picker rather than restate it. The typed
    // Query is the new note's name, and what comes back is a link to it, prefix and all.
    await tapControl(deviceId, snapshot, 'Create new', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(snapshot.isPickerOpen).toBe(false);
    expect(snapshot.link).toMatch(/^Person: /);
    expect(snapshot.link).toContain(query);
    capture(deviceId, '06-create-new');

    // `No link` — the second action, and the one that has to leave NOTHING behind, prefix included. It is
    // Also how this suite ends without a picker open for the next one to trip over.
    await openPicker();
    snapshot = await readStrip();
    expect(snapshot.isPickerOpen).toBe(true);
    await tapControl(deviceId, snapshot, 'No link', topOffsetInDevicePixels);
    snapshot = await readStrip();
    expect(snapshot.isPickerOpen).toBe(false);
    expect(snapshot.link).toBe('');
    capture(deviceId, '07-no-link');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Finds the vertical offset, in device pixels, between the page's coordinate space and the touchscreen's.
 *
 * A WebView may sit below a status bar, so a CSS `top` of 0 is not necessarily a screen `y` of 0, and
 * nothing inside the page reports the difference reliably across Android versions. Rather than assume one,
 * each candidate is TRIED: tap `Folders only`, and see whether its pressed state flipped. A candidate that
 * misses hits whatever is at those coordinates instead — usually a suggestion row, which closes the picker
 * — so the picker is reopened between attempts.
 *
 * @param deviceId - The emulator to drive.
 * @param snapshot - The strip as it stands, for the control rectangles.
 * @returns The offset that worked.
 */
async function calibrate(deviceId: string, snapshot: StripSnapshot): Promise<number> {
  const { devicePixelRatio, screenY } = snapshot.viewport;
  const candidates = [...new Set([0, Math.round(screenY * devicePixelRatio)])];

  for (const candidate of candidates) {
    await tapControl(deviceId, snapshot, 'Folders only', candidate);
    const afterTap = await readStrip();

    if (afterTap.isPickerOpen && findControl(afterTap, 'Folders only').isPressed) {
      // Restore, so calibration leaves the picker exactly as it found it.
      await tapControl(deviceId, afterTap, 'Folders only', candidate);
      return candidate;
    }

    if (!afterTap.isPickerOpen) {
      await openPicker();
    }
  }

  throw new Error(
    `Could not map the page onto the touchscreen. Tried offsets ${candidates.join(', ')} against `
      + `devicePixelRatio=${devicePixelRatio.toString()}, innerHeight=${snapshot.viewport.innerHeight.toString()}, screenY=${screenY.toString()}.`
  );
}

/**
 * Writes one PNG of the whole device screen.
 *
 * @param deviceId - The emulator to capture.
 * @param name - The frame's name, which becomes its file name.
 */
function capture(deviceId: string, name: string): void {
  const png = execFileSync('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(CAPTURE_DIRECTORY, `${name}.png`), png);
}

/**
 * @param snapshot - The strip to look in.
 * @param label - The control's visible label.
 * @returns The control.
 */
function findControl(snapshot: StripSnapshot, label: string): ControlSnapshot {
  const control = snapshot.controls.find((candidate) => candidate.label === label);
  if (!control) {
    throw new Error(`No control labelled ${label}.`);
  }

  return control;
}

/**
 * Opens the picker through the published API and leaves it open, stashing the promise where a later step
 * can read what it settled with.
 *
 * The API rather than the editor command, because the API takes the prefix — and the prefix is what the
 * two ACTIONS have to get right: `Create new` keeps it, `No link` drops it.
 */
async function openPicker(): Promise<void> {
  await evalInObsidian({
    async callback({ folderPath, lib: { waitUntil }, pluginId, prefix }): Promise<void> {
      const OPEN_TIMEOUT = 30_000;
      const captureWindow = window as CaptureWindow;

      await waitUntil({
        message: 'the plugin published its API',
        predicate: () => findRecord() !== undefined,
        timeoutInMilliseconds: OPEN_TIMEOUT
      });

      const record = findRecord();
      if (!record) {
        throw new TypeError(`No API record was published for "${pluginId}".`);
      }

      const bag: LinkBag = { link: null };
      captureWindow.__linkPickerCapture = bag;

      // Deliberately not awaited — `select` settles only once a control has ended the picker, which is
      // Several host round trips away. The answer is written into the bag whenever that happens, and the
      // Promise is kept so it is handled rather than floating.
      captureWindow.__linkPickerCapture.pending = record.api.select({ folderPath, prefix })
        .then((link: string) => {
          bag.link = link;
        })
        .catch(() => {
          bag.link = null;
        });

      await waitUntil({
        message: 'the picker is open',
        predicate: () => document.querySelector('.prompt') !== null,
        timeoutInMilliseconds: OPEN_TIMEOUT
      });

      function findRecord(): RecordLike | undefined {
        const registry = (window as CaptureWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
        return registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
      }
    },
    input: {
      folderPath: FOLDER_PATH,
      pluginId: PLUGIN_ID,
      prefix: PREFIX
    }
  });

  await sleepOnHost(SETTLE_DELAY_IN_MILLISECONDS);
}

/**
 * @returns Everything the assertions need about the strip, the search field and the viewport, read in one
 * round trip so the parts cannot disagree with each other.
 */
async function readStrip(): Promise<StripSnapshot> {
  return await evalInObsidian({
    callback(): StripSnapshot {
      const inputEl = document.querySelector('.prompt-input');

      return {
        controls: [...document.querySelectorAll('.link-picker-control')].map((el) => {
          const buttonEl = el as HTMLButtonElement;
          const rect = buttonEl.getBoundingClientRect();

          return {
            hasHotkeyHint: buttonEl.querySelector('.link-picker-control-hotkey') !== null,
            isDisabled: buttonEl.disabled,
            isPressed: buttonEl.getAttribute('aria-pressed') === 'true',
            label: buttonEl.querySelector('span')?.textContent ?? '',
            rect: {
              height: rect.height,
              left: rect.left,
              top: rect.top,
              width: rect.width
            }
          };
        }),
        isInputFocused: inputEl !== null && document.activeElement === inputEl,
        isPickerOpen: document.querySelector('.prompt') !== null,
        link: (window as CaptureWindow).__linkPickerCapture?.link ?? null,
        queryText: inputEl instanceof HTMLInputElement ? inputEl.value : '',
        suggestionCount: document.querySelectorAll('.suggestion-item').length,
        viewport: {
          devicePixelRatio: window.devicePixelRatio,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
          screenY: window.screenY
        }
      };
    },
    input: {}
  });
}

/**
 * @returns The id of the running emulator whose AVD is {@link AVD_NAME}.
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

  throw new Error(`No running emulator for AVD "${AVD_NAME}". Start it, or run the Android integration project once to have the harness start it.`);
}

/**
 * Puts a few notes in {@link FOLDER_PATH}, so the captured frames show a real list rather than an empty
 * one and the typed query has something to narrow.
 *
 * `lib.createNote` rather than `app.vault.create`: the Android transport loses roughly 0.9 % of
 * `vault.create` writes, landing the file at 0 bytes, and `createNote` reads back and repairs.
 */
async function seedVault(): Promise<void> {
  await evalInObsidian({
    async callback({ app, folderPath, lib: { createNote } }): Promise<void> {
      const names = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'];

      // `vault.create` refuses a path whose folder does not exist, and `createFolder` refuses one that
      // Does — so both are guarded, which also makes a re-run against a surviving vault a no-op.
      if (!app.vault.getAbstractFileByPath(folderPath)) {
        await app.vault.createFolder(folderPath);
      }

      for (const name of names) {
        const path = `${folderPath}/${name}.md`;
        if (app.vault.getAbstractFileByPath(path)) {
          continue;
        }

        await createNote({
          content: `# ${name}\n`,
          path
        });
      }
    },
    input: { folderPath: FOLDER_PATH }
  });
}

/**
 * `node:timers/promises` rather than a bare `setTimeout`, which this half of the file cannot use: it runs
 * in NODE, and the Obsidian lint rule that rewrites a bare `setTimeout` into `window.setTimeout` for
 * popout-window compatibility does not know that. Its fix typechecks and then throws `window is not
 * defined`.
 *
 * @param milliseconds - How long to wait.
 */
async function sleepOnHost(milliseconds: number): Promise<void> {
  await delay(milliseconds);
}

/**
 * Touches a control the way a finger does.
 *
 * @param deviceId - The emulator to drive.
 * @param snapshot - The strip the rectangle is taken from.
 * @param label - The control's visible label.
 * @param topOffsetInDevicePixels - The page-to-screen offset {@link calibrate} measured.
 */
async function tapControl(deviceId: string, snapshot: StripSnapshot, label: string, topOffsetInDevicePixels: number): Promise<void> {
  const { rect } = findControl(snapshot, label);
  const { devicePixelRatio } = snapshot.viewport;
  const x = Math.round((rect.left + rect.width / 2) * devicePixelRatio);
  const y = Math.round((rect.top + rect.height / 2) * devicePixelRatio) + topOffsetInDevicePixels;

  execFileSync('adb', ['-s', deviceId, 'shell', 'input', 'tap', x.toString(), y.toString()]);
  await sleepOnHost(SETTLE_DELAY_IN_MILLISECONDS);
}

/**
 * Types through the emulator's input method, so the search runs exactly as it does under a thumb.
 *
 * @param deviceId - The emulator to drive.
 * @param text - What to type. Letters and digits only; `input text` has its own escaping rules.
 */
function typeText(deviceId: string, text: string): void {
  execFileSync('adb', ['-s', deviceId, 'shell', 'input', 'text', text]);
}

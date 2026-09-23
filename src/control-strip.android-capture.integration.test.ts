/**
 * @file
 *
 * The control-strip pass on Android, driven by REAL touches.
 *
 * This was held open as "a manual pass on a phone", because three things about the strip cannot be
 * settled from desktop: that it is reachable and legible on a small screen, that a control's `mousedown`
 * `preventDefault` really does keep the search alive under a finger, and that an unavailable control reads
 * as disabled rather than missing.
 *
 * The first is answered by a captured frame a human looks at. The other two are answered HERE, on a device,
 * because a synthetic `HTMLElement.click()` dispatches no `mousedown` and so cannot show what
 * `preventDefault` prevents. The touch that does is the harness's **trusted mobile input**: `clickElement`
 * injects a CDP `Input.dispatchTouchEvent` pair into the WebView, which Blink expands into the same
 * compatibility `mousedown` → `mouseup` → `click` sequence a finger produces.
 *
 * **The suite does not take that expansion on trust.** Every tap below is required to have an observable
 * effect — `aria-pressed` flips, or the picker ends — and that effect arrives only at the END of the
 * compatibility sequence. So a tap that produced no `mousedown` could not produce the click the assertion
 * waits for either, and the suite would fail rather than pass while proving nothing. That is what keeps
 * the `preventDefault` step honest: the same tap has to flip `Subfolders` on AND leave the search field
 * focused with its query intact, and only the real sequence can do both.
 *
 * **There is no page-to-screen calibration here, and re-adding one would be a regression.** An `adb shell
 * input tap` speaks device pixels measured from the top of the SCREEN, so it needed `devicePixelRatio` and
 * an empirically-found status-bar offset — neither knowable from inside the page, so the offset had to be
 * discovered by trying candidates and seeing which one landed. CDP takes CSS pixels in the WebView's OWN
 * viewport, which is the coordinate space `getBoundingClientRect` already reports, so both terms are gone
 * by construction rather than by measurement.
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
 * `dist/`, which is gitignored. The listing's own mobile frames are the other suite's job. Photographing
 * the DEVICE rather than the page is the one thing still worth a device handle: `captureObsidianScreenshot`
 * goes through Appium in the WebView context and would leave out the system chrome these frames are read
 * against.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  captureDeviceScreenshot,
  evalInObsidian,
  pollInObsidian,
  resolveEmulatorDeviceId
} from 'obsidian-integration-testing';
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
 * The control strip's buttons, as the strip renders them.
 */
const CONTROL_SELECTOR = '.modal-command';

/**
 * Long, because every step is a round trip into the renderer and — for a trusted touch or key press —
 * back out to the host that injects it.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 600_000;

/**
 * Blink expands a touch into a touch sequence, then a synthesized mouse sequence, then a click. Obsidian
 * re-renders off the last of those, so a snapshot taken immediately after the tap can read the state from
 * before it.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 900;

/**
 * The budget each wait below actually gets, now that the waiting happens in NODE.
 *
 * A single `evalInObsidian` closure is capped at ~30s by the transport, so the two 30 s ceilings
 * `openPicker` used to declare shared one budget neither could have. `pollInObsidian` re-runs a short
 * `poll` closure from Node instead, so no single eval approaches the cap.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

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
  select: (params: Record<string, unknown>) => Promise<string>;
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

  /**
   * The viewport's height in CSS pixels, which is what the reachability assertion measures each control
   * against. It is the only thing left of the viewport the suite reads: `devicePixelRatio` and `screenY`
   * existed to convert a CSS rectangle into a screen coordinate for `adb shell input tap`, and a trusted
   * touch is aimed in CSS pixels instead.
   */
  readonly viewportHeight: number;
}

describe('The control strip, under a real finger on Android', () => {
  it('is reachable, keeps the search alive, disables rather than hides, and runs all six behaviors', async () => {
    mkdirSync(CAPTURE_DIRECTORY, { recursive: true });
    const deviceId = await resolveEmulatorDeviceId({ avdName: AVD_NAME });

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
      expect(control.rect.top + control.rect.height).toBeLessThanOrEqual(snapshot.viewportHeight);
    }

    // The strip is the picker's only affordance on a phone, so it must not be spending that width on keys
    // Nobody can press. `renderControls` suppresses the hint on mobile; this is where that is confirmed on
    // A device rather than against a mocked `Platform`.
    for (const control of snapshot.controls) {
      expect(control.hasHotkeyHint).toBe(false);
    }

    expect(snapshot.suggestionCount).toBeGreaterThan(0);
    await capture(deviceId, '01-strip');

    // `Folders only` on: the two controls it would empty the list with must go DISABLED, and must still be
    // There. Removing them would reflow the strip under the finger that is still on it.
    await tapControl('Folders only');
    snapshot = await readStrip();
    expect(findControl(snapshot, 'Folders only').isPressed).toBe(true);
    expect(findControl(snapshot, 'All files').isDisabled).toBe(true);
    expect(findControl(snapshot, 'Subfolders').isDisabled).toBe(true);
    expect(snapshot.controls).toHaveLength(CONTROL_LABELS.length);
    await capture(deviceId, '02-folders-only-disables');

    await tapControl('Folders only');
    snapshot = await readStrip();
    expect(findControl(snapshot, 'Folders only').isPressed).toBe(false);
    expect(findControl(snapshot, 'All files').isDisabled).toBe(false);

    // The query is PRESSED into the field key by key, not assigned to it — so what follows is a real
    // Search, in the state a thumb would leave it in.
    const query = 'Ada';
    await typeQuery(query);
    snapshot = await readStrip();
    expect(snapshot.queryText).toBe(query);
    expect(snapshot.isInputFocused).toBe(true);
    await capture(deviceId, '03-query-typed');

    // THE `preventDefault` PROOF. A touch on a control is a `mousedown` on something that is not the
    // Search field; without the handler's `preventDefault` the field loses focus, and a search in progress
    // Ends mid-word. Only a real touch can show this — `click()` never dispatches the `mousedown`. The
    // Pressed assertion is what keeps the other two from passing vacuously: no `mousedown`, no click, no
    // Toggle.
    await tapControl('Subfolders');
    snapshot = await readStrip();
    expect(findControl(snapshot, 'Subfolders').isPressed).toBe(true);
    expect(snapshot.queryText).toBe(query);
    expect(snapshot.isInputFocused).toBe(true);
    await capture(deviceId, '04-search-survives-a-touch');

    await tapControl('All files');
    snapshot = await readStrip();
    expect(findControl(snapshot, 'All files').isPressed).toBe(true);
    expect(snapshot.queryText).toBe(query);

    // On by default, so this one proves a touch can turn a toggle OFF as well as on.
    await tapControl('By date');
    snapshot = await readStrip();
    expect(findControl(snapshot, 'By date').isPressed).toBe(false);
    await capture(deviceId, '05-toggles');

    // `Create new` — the first of the two ACTIONS, which end the picker rather than restate it. The typed
    // Query is the new note's name, and what comes back is a link to it, prefix and all.
    await tapControl('Create new');
    snapshot = await readStrip();
    expect(snapshot.isPickerOpen).toBe(false);
    expect(snapshot.link).toMatch(/^Person: /);
    expect(snapshot.link).toContain(query);
    await capture(deviceId, '06-create-new');

    // `No link` — the second action, and the one that has to leave NOTHING behind, prefix included. It is
    // Also how this suite ends without a picker open for the next one to trip over.
    await openPicker();
    snapshot = await readStrip();
    expect(snapshot.isPickerOpen).toBe(true);
    await tapControl('No link');
    snapshot = await readStrip();
    expect(snapshot.isPickerOpen).toBe(false);
    expect(snapshot.link).toBe('');
    await capture(deviceId, '07-no-link');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Writes one PNG of the whole device screen.
 *
 * The DEVICE's framebuffer, not the page: these frames are read for the system chrome around the picker
 * as much as for the picker, and `captureObsidianScreenshot` photographs only the WebView.
 *
 * @param deviceId - The emulator to capture.
 * @param name - The frame's name, which becomes its file name.
 */
async function capture(deviceId: string, name: string): Promise<void> {
  const png = await captureDeviceScreenshot({ deviceId });
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
  await pollInObsidian({
    input: { pluginId: PLUGIN_ID },
    poll({ pluginId }): boolean {
      const registry = (window as CaptureWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
      return registry?.records[pluginId]?.some((candidate) => !candidate.isRevoked) ?? false;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the plugin never published its API',
    until: (isPublished: boolean): boolean => isPublished
  });

  await pollInObsidian({
    input: {
      folderPath: FOLDER_PATH,
      pluginId: PLUGIN_ID,
      prefix: PREFIX
    },
    poll(): boolean {
      return document.querySelector('.prompt') !== null;
    },
    start({ folderPath, pluginId, prefix }): void {
      const captureWindow = window as CaptureWindow;

      const registry = captureWindow.__obsidianDevUtils?.['pluginApiRegistry']?.value;
      const record: RecordLike | undefined = registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
      if (!record) {
        throw new TypeError(`No API record was published for "${pluginId}".`);
      }

      const bag: LinkBag = { link: null };
      captureWindow.__linkPickerCapture = bag;

      // Deliberately not awaited: `select` settles only once a control has ended the picker, several host round trips away.
      // The answer is written into the bag whenever that happens, and the promise is kept so it is handled rather than floating.
      bag.pending = record.api.select({ folderPath, prefix })
        .then((link: string) => {
          bag.link = link;
        })
        .catch(() => {
          bag.link = null;
        });
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never opened',
    until: (isOpen: boolean): boolean => isOpen
  });

  await sleepOnHost(SETTLE_DELAY_IN_MILLISECONDS);
}

/**
 * @returns Everything the assertions need about the strip, the search field and the viewport, read in one
 * round trip so the parts cannot disagree with each other.
 */
async function readStrip(): Promise<StripSnapshot> {
  return await evalInObsidian({
    callback({ controlSelector }): StripSnapshot {
      const inputEl = document.querySelector('.prompt-input');

      return {
        controls: [...document.querySelectorAll(controlSelector)].map((el) => {
          const buttonEl = el as HTMLButtonElement;
          const rect = buttonEl.getBoundingClientRect();

          return {
            hasHotkeyHint: buttonEl.querySelector('.modal-command-hotkey') !== null,
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
        viewportHeight: window.innerHeight
      };
    },
    input: { controlSelector: CONTROL_SELECTOR }
  });
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
 * Touches a control the way a thumb does.
 *
 * The element is found and clicked inside ONE closure, so the rectangle the touch is aimed at is the one
 * the element has at the moment of the touch — the strip re-lays-out as toggles flip, and a rectangle
 * carried across a round trip from Node could already be stale. That is also why no snapshot is passed in
 * any more: a trusted touch is aimed at an element, not at a coordinate.
 *
 * @param label - The control's visible label.
 */
async function tapControl(label: string): Promise<void> {
  await evalInObsidian({
    async callback({ controlLabel, controlSelector, lib: { clickElement } }): Promise<void> {
      const control = [...document.querySelectorAll(controlSelector)]
        .find((el) => el.querySelector('span')?.textContent === controlLabel);
      if (!(control instanceof HTMLElement)) {
        throw new TypeError(`No control labelled ${controlLabel}.`);
      }

      await clickElement({ element: control });
    },
    input: {
      controlLabel: label,
      controlSelector: CONTROL_SELECTOR
    }
  });

  await sleepOnHost(SETTLE_DELAY_IN_MILLISECONDS);
}

/**
 * Presses the query into the picker's field, one trusted key at a time.
 *
 * `pressKey` goes to whatever holds DOM focus, which is the field — so this only writes a query at all if
 * the picker genuinely has focus, and the assertion that follows reads a query the search really ran on.
 * Assigning `input.value` would write the same string past the input pipeline and prove neither.
 *
 * All the keys go in ONE closure on purpose: nothing may steal focus between them, and three injections
 * are nowhere near the per-eval cap.
 *
 * @param text - What to type.
 */
async function typeQuery(text: string): Promise<void> {
  await evalInObsidian({
    async callback({ lib: { pressKey }, text: query }): Promise<void> {
      // Sequential on purpose: keystrokes are ordered, and pressing them in parallel would race the field.
      for (const character of query) {
        await pressKey({ key: character });
      }
    },
    input: { text }
  });

  await sleepOnHost(SETTLE_DELAY_IN_MILLISECONDS);
}

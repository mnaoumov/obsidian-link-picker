import type { ObsidianPluginVitestConfigContext } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';
import type { TestProjectConfiguration } from 'vitest/config';

import { defineObsidianPluginVitestConfig } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';

/**
 * The demo-vault button suite. It drives a real desktop Obsidian like the desktop project, but opens
 * a copy of the in-repo `demo-vault/` rather than an empty vault — hence its own `globalSetup` — and
 * needs its own suffix so the desktop project does not also collect it and open it against a vault
 * with no notes in it.
 */
const DEMO_VAULT_TEST_FILES = 'src/**/*.demo-vault.integration.test.ts';

/**
 * The two halves of the listing set, which write `images/screenshots/screenshot-desktop-*.png` and
 * `images/screenshots/screenshot-mobile-*.png`.
 *
 * Named `*.desktop-capture.` / `*.android-capture.` rather than `*.desktop.` / `*.android.` so they match
 * NONE of the standard project globs. That keeps them out of `npm run test:integration` entirely —
 * capturing is an explicit operation (`npm run capture:screenshots`), not something every test run does,
 * and folding them in would rewrite the PNGs on every run and dirty the tree mid-release.
 */
const DESKTOP_CAPTURE_TEST_FILES = 'src/**/*.desktop-capture.integration.test.ts';
const SCREENSHOTS_CAPTURE_ANDROID_TEST_FILES = 'src/**/screenshots.android-capture.integration.test.ts';

/**
 * The control-strip pass on Android, which drives the picker with real `adb` touches and writes its frames
 * to `dist/control-strip/`.
 *
 * Named `*.android-capture.` for the same reason as above — it matches NONE of the standard project globs,
 * including the Android project's own `*.android.` — so `npm run test:integration:android` never picks it
 * up. It needs an emulator, it shells out to `adb`, and it takes minutes; running it is an explicit
 * operation (`npm run capture:control-strip`).
 *
 * Both Android capture suites share that one suffix on purpose: it is the file name ODU's shared ESLint
 * config exempts from `no-untrusted-input-events` (the trusted-input helpers are built on
 * `window.electron`, which Android does not have), and it is the name the rest of the fleet's screenshot
 * suites already carry. This repo is the only one with TWO Android capture projects, so the two globs name
 * the FILE rather than the bare suffix — routing both projects off `*.android-capture.` would hand each
 * suite to the other's project, running the control-strip pass on the 900x1600 screenshots AVD and taking
 * the listing shots on the 1344x2992 shared one, where they fail their own size assertion.
 */
const CONTROL_STRIP_CAPTURE_TEST_FILES = 'src/**/control-strip.android-capture.integration.test.ts';

/**
 * The AVD the mobile shots are taken on: 900x1600 at density 320, which is exactly the size the community
 * store asks for, so the capture needs no crop, no rescale and no letterbox.
 *
 * The shared `obsidian_test` AVD the control-strip pass drives is a Pixel 10 Pro XL at 1344x2992 (~9:20)
 * and cannot produce it. Resizing that one at runtime is not an option either: the display change recreates
 * the activity, and with it the WebView the Appium session is attached to.
 */
const SCREENSHOT_AVD_NAME = 'obsidian_screenshots';

const APPIUM_URL = 'http://localhost:4723';

/**
 * The screenshots AVD is cold-booted and rarely used, so Obsidian's first layout on it is far slower than
 * on the well-warmed shared one; the 90s default expires while it is still starting up.
 */
const LAYOUT_READY_TIMEOUT_IN_MILLISECONDS = 240_000;

/**
 * One `it` per note runs every button in that note, and each button re-opens the note, walks the
 * preview to find itself and then waits up to 15s for a result. A note with a dozen buttons therefore
 * blows well past the desktop project's 30s default — which fails the whole note with a bare vitest
 * timeout instead of naming the button that actually misbehaved.
 */
const DEMO_VAULT_TIMEOUT_IN_MILLISECONDS = 600_000;

/**
 * The control-strip pass is one long test whose every step is a round trip out to `adb` and back into the
 * renderer — a tap, a settle, a snapshot, sometimes a full-screen PNG — on top of an already slow Appium
 * transport. The Android project's own 60s budget covers a single assertion, not a seven-frame walk.
 */
const CONTROL_STRIP_TIMEOUT_IN_MILLISECONDS = 600_000;

export const config = defineObsidianPluginVitestConfig({
  customProjects(context: ObsidianPluginVitestConfigContext): TestProjectConfiguration[] {
    return [
      {
        test: {
          ...context.android,
          include: [CONTROL_STRIP_CAPTURE_TEST_FILES],
          name: 'capture-control-strip:android',
          testTimeout: CONTROL_STRIP_TIMEOUT_IN_MILLISECONDS
        }
      },
      {
        test: {
          ...context.desktop,
          include: [DESKTOP_CAPTURE_TEST_FILES],
          name: 'capture-screenshots:desktop'
        }
      },
      {
        test: {
          ...context.android,
          environmentOptions: {
            obsidianTransport: {
              appiumUrl: APPIUM_URL,
              avdName: SCREENSHOT_AVD_NAME,
              layoutReadyTimeoutInMilliseconds: LAYOUT_READY_TIMEOUT_IN_MILLISECONDS,
              type: 'obsidian-android-appium'
            }
          },
          include: [SCREENSHOTS_CAPTURE_ANDROID_TEST_FILES],
          name: 'capture-screenshots:android'
        }
      },
      {
        test: {
          ...context.desktop,
          globalSetup: ['./scripts/demo-vault-global-setup.ts'],
          include: [DEMO_VAULT_TEST_FILES],
          name: 'integration-tests:demo-vault',
          testTimeout: DEMO_VAULT_TIMEOUT_IN_MILLISECONDS
        }
      }
    ];
  }
});

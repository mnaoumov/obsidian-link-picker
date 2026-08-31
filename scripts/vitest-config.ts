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
 * The screenshot-capture suite that writes `images/screenshots/screenshot-desktop-*.png`.
 *
 * Named `*.desktop-capture.` rather than `*.desktop.` so it matches NONE of the standard project
 * globs. That keeps it out of `npm run test:integration` entirely — capturing is an explicit operation
 * (`npm run capture:screenshots`), not something every test run does, and folding it in would rewrite
 * the PNGs on every run and dirty the tree mid-release.
 */
const DESKTOP_CAPTURE_TEST_FILES = 'src/**/*.desktop-capture.integration.test.ts';

/**
 * The control-strip pass on Android, which drives the picker with real `adb` touches and writes its frames
 * to `dist/control-strip/`.
 *
 * Named `*.android-capture.` for the same reason as above — it matches NONE of the standard project globs,
 * including the Android project's own `*.android.` — so `npm run test:integration:android` never picks it
 * up. It needs an emulator, it shells out to `adb`, and it takes minutes; running it is an explicit
 * operation (`npm run capture:control-strip`).
 */
const ANDROID_CAPTURE_TEST_FILES = 'src/**/*.android-capture.integration.test.ts';

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
          include: [ANDROID_CAPTURE_TEST_FILES],
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

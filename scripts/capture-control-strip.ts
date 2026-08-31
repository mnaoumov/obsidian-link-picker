import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

// Android only, and deliberately outside `test:integration`. It drives the picker with real `adb` touches
// On the `obsidian_test` emulator and writes `dist/control-strip/*.png` — the evidence for the pre-release
// Control-strip pass that no desktop suite can produce.
await wrapCliTask(async () => {
  await test({
    projects: ['capture-control-strip:android']
  });
});

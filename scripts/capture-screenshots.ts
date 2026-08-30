import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

// Desktop only. The plugin runs on mobile too, but the community-store listing shows desktop frames,
// And a phone-sized picker says nothing the desktop one does not.
await wrapCliTask(async () => {
  await test({
    projects: ['capture-screenshots:desktop']
  });
});

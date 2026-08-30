/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs, driving a
 * staged vault in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * Two shots, because the plugin's value is two things and one frame cannot say
 * both: that the picker navigates by FOLDER, and that its ranking is ordered
 * rather than fuzzy. The first frame shows the picker rooted inside a folder
 * with the way out pinned above its contents; the second shows one query
 * putting four similarly-named notes in a fixed order.
 *
 * Excluded from `npm run test:integration` by its file name — see the
 * `capture-screenshots:desktop` project in `scripts/vitest-config.ts`.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'link-picker';
const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
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

      // The picker is the subject, not the file explorer, so the sidebar is collapsed to give the
      // Modal the frame.
      app.workspace.leftSplit.collapse();

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

describe('desktop store screenshots', () => {
  it('1 - the picker rooted inside a folder', async () => {
    const rows = await openPicker({ folderQuery: 'Legal', query: '' });

    expect(rows.length).toBeGreaterThan(1);
    await shoot(1, 'Navigate folders instead of guessing names');
  });

  it('2 - the deterministic ranking', async () => {
    const rows = await openPicker({ folderQuery: 'Ranking', query: 'court' });

    expect(rows.length).toBeGreaterThan(1);
    await shoot(2, 'One query, one order — exact match first');
  });
});

interface OpenPickerParams {
  readonly folderQuery: string;
  readonly query: string;
}

/**
 * Opens the picker, navigates into a folder, and leaves it on screen for the capture.
 *
 * @param params - The folder to navigate into, and what to type once inside it.
 * @returns The rows the picker is showing.
 */
async function openPicker(params: OpenPickerParams): Promise<string[]> {
  return await evalInObsidian({
    async callback({ app, folderQuery, lib: { pressKey, waitUntil }, pluginId, query }) {
      const TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;

      // Each shot leaves its picker on screen — that is the point of the shot — so the next one has to
      // Put it away before opening its own.
      if (document.querySelector('.prompt')) {
        pressKey({ key: 'Escape' });
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
      folderQuery: params.folderQuery,
      pluginId: PLUGIN_ID,
      query: params.query
    },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

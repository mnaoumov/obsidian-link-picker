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
 * Excluded from `npm run test:integration` by its file name — see the `capture-screenshots:android`
 * project in `scripts/vitest-config.ts`. Capturing is an explicit operation (`npm run capture:screenshots`).
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
    const rows = await openPicker({ folderQuery: 'Legal', query: '' });

    expect(rows.length).toBeGreaterThan(1);
    await shoot(1, 'Navigate folders with a tap — no hotkeys needed');
  });

  it('2 - the deterministic ranking', async () => {
    const rows = await openPicker({ folderQuery: 'Ranking', query: 'court' });

    expect(rows.length).toBeGreaterThan(1);
    // The caption names the ORDER rather than the query, deliberately. `labelScreenshot` draws its band
    // Across the bottom of the frame, which on desktop is Obsidian's status bar but on a phone is the
    // Picker's search field — so the typed query is the one thing in this frame that is NOT fully legible.
    // The four rows above it are, and they are what the shot is actually evidence for.
    await shoot(2, 'Exact match first, then prefix, then the rest');
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
    async callback({ app, declineControlLabel, folderQuery, lib: { waitUntil }, pluginId, query }) {
      const TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;

      // Each shot leaves its picker on screen — that is the point of the shot — so the next one has to
      // Put it away before opening its own.
      if (document.querySelector('.prompt')) {
        const declineControl = [...document.querySelectorAll('.link-picker-control')]
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
 * Captures the device framebuffer, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
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
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

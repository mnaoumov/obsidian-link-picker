import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The `segmentMatchMode` setting against a real Obsidian. Under `Substring` — the default, and the only
 * rule the picker had before the setting existed — a term must appear inside a path part as one unbroken
 * run, so `Brv` finds nothing. Under `Fuzzy` the characters only have to appear in order, so it finds
 * `Bravo`.
 *
 * Cross-platform (G47): the manifest declares `isDesktopOnly: false`. The setting is written through the
 * plugin's own settings component rather than through the settings tab, which is what keeps this suite
 * free of any key press — the picker itself is driven by clicking, as every cross-platform suite here is.
 *
 * Split across several `evalInObsidian` calls because one of them is one `execute/sync`, which WebDriver
 * caps at 30 seconds — and the setting has to be saved BETWEEN two openings of the picker, since the mode
 * is resolved when the picker opens.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

const FUZZY_MODE = 'Fuzzy';
const SUBSTRING_MODE = 'Substring';

interface ModeRows {
  readonly fuzzy: string[];
  readonly substring: string[];
}

interface PluginWithSettings {
  readonly pluginSettingsComponent: SettingsComponentLike;
}

interface SettingsComponentLike {
  saveToFile(): Promise<void>;
  setProperty(propertyName: string, value: unknown): Promise<string>;
}

describe('The segment matching setting', () => {
  it('finds a broken-up query only under fuzzy matching', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
    const noteName = `Bravo${stamp}`;
    // `Brv…` is inside `Bravo…` in order but not contiguously — exactly the case the two modes disagree
    // About. The stamp rides along so the query cannot match a note some other suite left behind.
    const brokenUpQuery = `Brv${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await evalInObsidian({
      async callback({ app, lib: { createNote, waitUntil }, noteName: name, sourcePath: path }): Promise<void> {
        const TIMEOUT_IN_MILLISECONDS = 30_000;

        await createNote({
          content: '# Bravo\n',
          path: `${name}.md`
        });
        // The source note is deliberately empty, so a content read-back would prove nothing.
        await app.vault.create(path, '');

        await waitUntil({
          message: 'both notes are in the vault',
          predicate: () => app.vault.getFileByPath(`${name}.md`) !== null && app.vault.getFileByPath(path) !== null,
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });
      },
      input: { noteName, sourcePath }
    });

    const modeRows = await readBothModes();

    expect(modeRows.substring.join('\n')).not.toContain(noteName);
    expect(modeRows.fuzzy.join('\n')).toContain(noteName);

    /**
     * Reads the rows under each mode in turn, then puts the setting back.
     *
     * The restore is in a `finally` because the integration suites share ONE Obsidian: a failed read must
     * not leave the next suite opening its picker under a mode it never asked for.
     *
     * @returns The rows the picker offered under each mode.
     */
    async function readBothModes(): Promise<ModeRows> {
      try {
        const substring = await openAndRead(SUBSTRING_MODE);
        const fuzzy = await openAndRead(FUZZY_MODE);
        return { fuzzy, substring };
      } finally {
        await evalInObsidian({
          async callback({ app, mode, pluginId }): Promise<void> {
            const plugin: unknown = app.plugins.plugins[pluginId];
            const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;
            await settingsComponent.setProperty('segmentMatchMode', mode);
            await settingsComponent.saveToFile();
          },
          input: { mode: SUBSTRING_MODE, pluginId: PLUGIN_ID }
        });
      }
    }

    /**
     * Puts the plugin in one mode, opens the picker over the source note, types the broken-up query, and
     * reads the rows it offered — closing the picker either way, so the next opening starts clean.
     *
     * @param mode - The mode to read the rows under.
     * @returns The rows the picker offered.
     */
    async function openAndRead(mode: string): Promise<string[]> {
      return await evalInObsidian({
        async callback({ app, lib: { waitUntil }, mode: segmentMatchMode, pluginId, query, sourcePath: path }): Promise<string[]> {
          const RENDER_DELAY_IN_MILLISECONDS = 400;
          const TIMEOUT_IN_MILLISECONDS = 30_000;

          const plugin: unknown = app.plugins.plugins[pluginId];
          const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;
          await settingsComponent.setProperty('segmentMatchMode', segmentMatchMode);
          await settingsComponent.saveToFile();

          const source = app.vault.getFileByPath(path);
          if (!source) {
            throw new Error(`The source note ${path} is gone.`);
          }

          await app.workspace.getLeaf(true).openFile(source);
          await waitUntil({
            message: 'the note being edited is open',
            predicate: () => app.workspace.getActiveFile()?.path === source.path,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });

          app.commands.executeCommandById(`${pluginId}:insert-link`);
          await waitUntil({
            message: 'the picker is open',
            predicate: () => document.querySelector('.prompt') !== null,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });
          await sleep(RENDER_DELAY_IN_MILLISECONDS);

          const input = document.querySelector('.prompt-input');
          if (!(input instanceof HTMLInputElement)) {
            throw new TypeError('The picker has no input.');
          }
          input.focus();
          input.value = query;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(RENDER_DELAY_IN_MILLISECONDS);

          const rows = [...document.querySelectorAll('.suggestion-item')].map((el) => el.textContent);

          // Declining is a pick rather than walking away, so the picker never survives into the next
          // Opening — and it is the only way out when the query matched nothing at all.
          const buttonEl = [...document.querySelectorAll('.modal-command')]
            .find((el) => el.querySelector('span')?.textContent === 'No link');
          if (!(buttonEl instanceof HTMLElement)) {
            throw new TypeError('No control labelled No link.');
          }
          buttonEl.click();

          await waitUntil({
            message: 'the picker closed',
            predicate: () => document.querySelector('.prompt') === null,
            timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
          });

          return rows;
        },
        input: { mode, pluginId: PLUGIN_ID, query: brokenUpQuery, sourcePath }
      });
    }
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

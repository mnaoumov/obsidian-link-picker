import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
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
 * Cross-platform: the manifest declares `isDesktopOnly: false`. The setting is written through the
 * plugin's own settings component rather than through the settings tab, which is what keeps this suite
 * free of any key press — the picker itself is driven by clicking, as every cross-platform suite here is.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** The setting has
 * to be saved BETWEEN two openings of the picker, since the mode is resolved when the picker opens — so
 * the flow was already split across calls, and each of those calls then declared a ceiling the ~30s
 * transport cap could never honour. `pollInObsidian` is what makes the ceiling real: every poll is its own
 * short eval.
 *
 * The one closure that stays whole is the one that types the query, reads the rows and declines: the
 * broken-up query deliberately matches NOTHING under `Substring`, so there is no row to poll for, and a
 * re-render landing between the read and the decline would read one state and act on another.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

const FUZZY_MODE = 'Fuzzy';
const SUBSTRING_MODE = 'Substring';

/**
 * A render settle, short enough to sit inside an act closure without approaching the per-eval cap.
 */
const RENDER_DELAY_IN_MILLISECONDS = 400;

/**
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's: Android
 * sets the floor, not desktop, and an aged emulator takes tens of seconds to lay out.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * Above the sum of the budgets used below, so a genuine stall reports the NAMED poll timeout rather than
 * losing the race to a bare vitest timeout.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

interface PluginWithSettings {
  readonly pluginSettingsComponent: SettingsComponentLike;
}

interface SettingsComponentLike {
  saveToFile(): Promise<void>;
  setProperty(propertyName: string, value: unknown): Promise<string>;
}

describe('The segment matching setting', () => {
  it('finds a broken-up query only under fuzzy matching', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const noteName = `Bravo${stamp}`;
    // `Brv…` is inside `Bravo…` in order but not contiguously, which is exactly the case the two modes disagree about.
    // The stamp rides along so the query cannot match a note some other suite left behind.
    const brokenUpQuery = `Brv${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { noteName, sourcePath },
      poll({ app, noteName: name, sourcePath: path }): boolean {
        return app.vault.getFileByPath(`${name}.md`) !== null && app.vault.getFileByPath(path) !== null;
      },
      async start({ app, lib: { createNote }, noteName: name, sourcePath: path }): Promise<void> {
        await createNote({
          content: '# Bravo\n',
          path: `${name}.md`
        });
        // The source note is deliberately empty, so a content read-back would prove nothing.
        await app.vault.create(path, '');
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the staged notes never appeared in the vault',
      until: (arePresent: boolean): boolean => arePresent
    });

    // The restore is in a `finally` because the integration suites share ONE Obsidian.
    // A failed read must not leave the next suite opening its picker under a mode it never asked for.
    // The assertions sit inside it so each reading can be a `const` at the point it is taken.
    try {
      const substring = await openAndRead(SUBSTRING_MODE, brokenUpQuery, sourcePath);
      const fuzzy = await openAndRead(FUZZY_MODE, brokenUpQuery, sourcePath);

      expect(substring.join('\n')).not.toContain(noteName);
      expect(fuzzy.join('\n')).toContain(noteName);
    } finally {
      await setMode(SUBSTRING_MODE);
    }
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Puts the plugin in one mode, opens the picker over the source note, types the broken-up query, and
 * reads the rows it offered — closing the picker either way, so the next opening starts clean.
 *
 * @param mode - The mode to read the rows under.
 * @param query - The broken-up query to type.
 * @param sourcePath - The note the picker is opened over.
 * @returns The rows the picker offered.
 */
async function openAndRead(mode: string, query: string, sourcePath: string): Promise<string[]> {
  await setMode(mode);

  await pollInObsidian({
    input: { sourcePath },
    poll({ app }): string {
      return app.workspace.getActiveFile()?.path ?? '';
    },
    async start({ app, sourcePath: path }): Promise<void> {
      const source = app.vault.getFileByPath(path);
      if (!source) {
        throw new Error(`The source note ${path} is gone.`);
      }

      await app.workspace.getLeaf(true).openFile(source);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the note being edited never became the active file',
    until: (path: string): boolean => path === sourcePath
  });

  await pollInObsidian({
    input: { pluginId: PLUGIN_ID, promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) !== null;
    },
    start({ app, pluginId }): void {
      app.commands.executeCommandById(`${pluginId}:insert-link`);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never opened',
    until: (isOpen: boolean): boolean => isOpen
  });

  const rows = await evalInObsidian({
    async callback({ controlSelector, inputSelector, query: text, renderDelayInMilliseconds, rowSelector }): Promise<string[]> {
      await sleep(renderDelayInMilliseconds);

      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The picker has no input.');
      }

      input.focus();
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(renderDelayInMilliseconds);

      const offered = [...document.querySelectorAll(rowSelector)].map((el) => el.textContent);

      // Declining is a pick rather than walking away, so the picker never survives into the next opening.
      // It is also the only way out when the query matched nothing at all.
      const buttonEl = [...document.querySelectorAll(controlSelector)]
        .find((el) => el.querySelector('span')?.textContent === 'No link');
      if (!(buttonEl instanceof HTMLElement)) {
        throw new TypeError('No control labelled No link.');
      }

      buttonEl.click();

      return offered;
    },
    input: {
      controlSelector: CONTROL_SELECTOR,
      inputSelector: INPUT_SELECTOR,
      query,
      renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS,
      rowSelector: ROW_SELECTOR
    }
  });

  await pollInObsidian({
    input: { promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) === null;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never closed',
    until: (isClosed: boolean): boolean => isClosed
  });

  return rows;
}

/**
 * Writes the plugin's `segmentMatchMode` setting and saves it.
 *
 * @param mode - The mode to write.
 */
async function setMode(mode: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, mode: segmentMatchMode, pluginId }): Promise<void> {
      const plugin: unknown = app.plugins.plugins[pluginId];
      const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;
      await settingsComponent.setProperty('segmentMatchMode', segmentMatchMode);
      await settingsComponent.saveToFile();
    },
    input: { mode, pluginId: PLUGIN_ID }
  });
}

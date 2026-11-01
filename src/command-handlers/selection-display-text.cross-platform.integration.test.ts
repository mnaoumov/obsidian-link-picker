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
 * `Use selection as display text`, end to end against a real Obsidian: the text selected before the
 * command runs comes back as the display text of the inserted link, instead of being replaced by it.
 *
 * Cross-platform for the same reason as `insert-link`: the behavior has to hold on a phone too.
 *
 * Every wait is its own `pollInObsidian`, and every closure below is milliseconds of DOM reading, for the
 * reason `insert-link.cross-platform.integration.test.ts` gives.
 */

const PLUGIN_ID = 'link-picker';

const PROMPT_SELECTOR = '.prompt';
const INPUT_SELECTOR = '.prompt-input';
const ROW_SELECTOR = '.suggestion-item';

const RENDER_DELAY_IN_MILLISECONDS = 400;
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

interface PluginWithSettings {
  readonly pluginSettingsComponent: SettingsComponentLike;
}

interface SettingsComponentLike {
  readonly saveToFile: () => Promise<void>;
  readonly setProperty: (propertyName: string, value: unknown) => Promise<string>;
}

describe('The `Use selection as display text` setting', () => {
  it('keeps the selected text as the display text of the inserted link', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const targetName = `Ada-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;
    const displayText = `Countess-${stamp}`;

    await setShouldUseSelectionAsDisplayText(true);

    try {
      await pollInObsidian({
        input: { displayText, sourcePath, targetName },
        poll({ app, sourcePath: path, targetName: name }): boolean {
          return app.vault.getFileByPath(`${name}.md`) !== null && app.vault.getFileByPath(path) !== null;
        },
        async start({ displayText: text, lib: { createNote }, sourcePath: path, targetName: name }): Promise<void> {
          await createNote({
            content: '# Ada\n',
            path: `${name}.md`
          });
          // Through `createNote` rather than `vault.create`, because this note's CONTENT is what gets selected.
          await createNote({
            content: text,
            path
          });
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'the staged notes never appeared in the vault',
        until: (arePresent: boolean): boolean => arePresent
      });

      const selection = await pollInObsidian({
        input: { sourcePath },
        poll({ app, obsidianModule, sourcePath: path }): string {
          const editor = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor;

          if (!editor || app.workspace.getActiveFile()?.path !== path) {
            return '';
          }

          if (!editor.somethingSelected()) {
            editor.setSelection({ ch: 0, line: 0 }, editor.offsetToPos(editor.getValue().length));
          }

          return editor.getSelection();
        },
        async start({ app, sourcePath: path }): Promise<void> {
          const source = app.vault.getFileByPath(path);
          if (!source) {
            throw new Error(`The source note ${path} is gone.`);
          }

          await app.workspace.getLeaf(true).openFile(source);
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'the source note never opened with its text selected',
        until: (text: string): boolean => text === displayText
      });

      await pollInObsidian({
        input: { promptSelector: PROMPT_SELECTOR },
        poll({ promptSelector }): boolean {
          return document.querySelector(promptSelector) === null;
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'a picker was left open by an earlier suite',
        until: (isClosed: boolean): boolean => isClosed
      });

      const initialQuery = await pollInObsidian({
        input: { inputSelector: INPUT_SELECTOR, pluginId: PLUGIN_ID },
        poll({ inputSelector }): string {
          const input = document.querySelector(inputSelector);
          return input instanceof HTMLInputElement ? input.value : '';
        },
        start({ app, pluginId }): void {
          app.commands.executeCommandById(`${pluginId}:insert-link`);
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'the picker never opened seeded with the selection',
        until: (query: string): boolean => query === displayText
      });

      await evalInObsidian({
        async callback({ inputSelector, renderDelayInMilliseconds, targetName: name }): Promise<void> {
          await sleep(renderDelayInMilliseconds);

          const input = document.querySelector(inputSelector);
          if (!(input instanceof HTMLInputElement)) {
            throw new TypeError('The picker has no input.');
          }

          // The selection matches no note, so the query is replaced to find the target; the display text was fixed when the command ran.
          // A dispatched event rather than trusted input: the harness drives keys through Electron's input API, which Android has not got.
          input.value = name;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        input: {
          inputSelector: INPUT_SELECTOR,
          renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS,
          targetName
        }
      });

      await pollInObsidian({
        input: { rowSelector: ROW_SELECTOR, targetName },
        poll({ rowSelector, targetName: name }): boolean {
          return [...document.querySelectorAll(rowSelector)].some((el) => el.textContent.includes(name));
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'the picked note was never offered',
        until: (isOffered: boolean): boolean => isOffered
      });

      await evalInObsidian({
        callback({ rowSelector, targetName: name }): void {
          const row = [...document.querySelectorAll(rowSelector)].find((el) => el.textContent.includes(name));
          if (!(row instanceof HTMLElement)) {
            throw new TypeError('The picked note was not offered.');
          }

          row.click();
        },
        input: { rowSelector: ROW_SELECTOR, targetName }
      });

      const editorText = await pollInObsidian({
        input: { promptSelector: PROMPT_SELECTOR },
        poll({ app, obsidianModule, promptSelector }): string {
          return document.querySelector(promptSelector) === null ? app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '' : '';
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'the link never replaced the selection',
        until: (text: string): boolean => text.includes(targetName)
      });

      expect(selection).toBe(displayText);
      expect(initialQuery).toBe(displayText);
      expect(editorText).toMatch(new RegExp(String.raw`\|${displayText}]]|\[${displayText}]\(`));
    } finally {
      await setShouldUseSelectionAsDisplayText(false);
    }
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

async function setShouldUseSelectionAsDisplayText(shouldUseSelectionAsDisplayText: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, pluginId, shouldUseSelectionAsDisplayText: isOn }): Promise<void> {
      const plugin: unknown = app.plugins.plugins[pluginId];
      const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;
      await settingsComponent.setProperty('shouldUseSelectionAsDisplayText', isOn);
      await settingsComponent.saveToFile();
    },
    input: { pluginId: PLUGIN_ID, shouldUseSelectionAsDisplayText }
  });
}

import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * A picker's trigger, end to end against a real Obsidian: typing `@` and a query in a note offers the picker, `Enter`
 * opens it seeded with the query, and the pick replaces the trigger and the query with the link. Typing a space after
 * the trigger keeps it as plain text.
 *
 * Cross-platform, because the trigger exists for the phone above all: there a named picker is otherwise reached only
 * through the command palette.
 *
 * The text goes in through the harness's TRUSTED `typeIntoEditor` and the `Enter` through its trusted `pressKey`, both
 * of which work on Android too, since an editor suggest only reacts to real typing.
 *
 * Every wait is its own `pollInObsidian`, with the budget in Node, as the other suites here explain.
 */

const PLUGIN_ID = 'link-picker';
const PICKER_ID = 'trigger-integration-test-picker';
const TRIGGER = '@';

const PROMPT_SELECTOR = '.prompt';
const INPUT_SELECTOR = '.prompt-input';
const PROMPT_ROW_SELECTOR = '.prompt .suggestion-item';
const EDITOR_SUGGEST_ROW_SELECTOR = '.suggestion-container:not(.prompt) .suggestion-item';

/**
 * A render settle for asserting that something did NOT appear, which no poll can do.
 */
const RENDER_DELAY_IN_MILLISECONDS = 1000;

const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

interface PickerSettings {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- `editAndSave` hands over the live settings object, and the test replaces its picker list in place.
  pickers: unknown[];
}

interface PickerSettingsComponent {
  readonly editAndSave: (editor: (settings: PickerSettings) => void) => Promise<void>;
}

interface PluginWithSettings {
  readonly pluginSettingsComponent: PickerSettingsComponent;
}

interface StoredPicker {
  readonly id: string;
}

const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
const pickerName = `Trigger picker ${stamp}`;
const targetName = `Qz${stamp.replace('-', '')}`;

describe('A picker trigger', () => {
  beforeAll(async () => {
    await pollInObsidian({
      input: { pickerId: PICKER_ID, pickerName, pluginId: PLUGIN_ID, targetName, trigger: TRIGGER },
      poll({ app, targetName: name }): boolean {
        return app.vault.getFileByPath(`${name}.md`) !== null;
      },
      async start({ app, lib: { createNote }, pickerId, pickerName: name, pluginId, targetName: target, trigger }): Promise<void> {
        await createNote({ content: `# ${target}\n`, path: `${target}.md` });
        const plugin: unknown = app.plugins.plugins[pluginId];
        if (typeof plugin !== 'object' || plugin === null || !('pluginSettingsComponent' in plugin)) {
          throw new Error('The plugin is not enabled.');
        }

        const { pluginSettingsComponent } = plugin as PluginWithSettings;
        await pluginSettingsComponent.editAndSave((settings) => {
          settings.pickers = [
            ...settings.pickers.filter((picker) => (picker as StoredPicker).id !== pickerId),
            {
              folderPath: '',
              id: pickerId,
              includeSubfolders: false,
              name,
              noteCreatorName: '',
              placeholder: '',
              prefix: '',
              shouldAllowCreate: true,
              shouldApplyPrefixSuffixWhenNoLinkSelected: false,
              shouldUseSelectionAsDisplayText: false,
              suffix: '',
              trigger
            }
          ];
        });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the target note never appeared in the vault',
      until: (isPresent: boolean): boolean => isPresent
    });
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  afterAll(async () => {
    await evalInObsidian({
      async callback({ app, pickerId, pluginId }): Promise<void> {
        const plugin: unknown = app.plugins.plugins[pluginId];
        if (typeof plugin !== 'object' || plugin === null || !('pluginSettingsComponent' in plugin)) {
          throw new Error('The plugin is not enabled.');
        }

        const { pluginSettingsComponent } = plugin as PluginWithSettings;
        await pluginSettingsComponent.editAndSave((settings) => {
          settings.pickers = settings.pickers.filter((picker) => (picker as StoredPicker).id !== pickerId);
        });
      },
      input: { pickerId: PICKER_ID, pluginId: PLUGIN_ID }
    });
  });

  it('offers the picker, opens it seeded with the query, and replaces the trigger with the link', async () => {
    const sourcePath = `Source-trigger-${stamp}.md`;
    await openEmptyNote(sourcePath);

    const query = targetName.slice(0, -1);
    await typeIntoActiveEditor(`${TRIGGER}${query}`);

    await pollInObsidian({
      input: { pickerName, rowSelector: EDITOR_SUGGEST_ROW_SELECTOR },
      poll({ pickerName: name, rowSelector }): boolean {
        return [...document.querySelectorAll(rowSelector)].some((el) => el.textContent.includes(name));
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'typing the trigger never offered the picker',
      until: (isOffered: boolean): boolean => isOffered
    });

    const seededQuery = await pollInObsidian({
      input: { inputSelector: INPUT_SELECTOR },
      poll({ inputSelector }): string {
        const input = document.querySelector(inputSelector);
        return input instanceof HTMLInputElement ? input.value : '';
      },
      async start({ lib: { pressKey } }): Promise<void> {
        await pressKey({ key: 'Enter' });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'Enter on the offered row never opened the picker with the query',
      until: (value: string): boolean => value === query
    });

    await pollInObsidian({
      input: { rowSelector: PROMPT_ROW_SELECTOR, targetName },
      poll({ rowSelector, targetName: name }): boolean {
        return [...document.querySelectorAll(rowSelector)].some((el) => el.textContent.includes(name));
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker never offered the target note',
      until: (isOffered: boolean): boolean => isOffered
    });

    await evalInObsidian({
      async callback({ lib: { clickElement }, rowSelector, targetName: name }): Promise<void> {
        const row = [...document.querySelectorAll(rowSelector)].find((el) => el.textContent.includes(name));
        if (!(row instanceof HTMLElement)) {
          throw new TypeError('The target note was not offered.');
        }

        await clickElement({ element: row });
      },
      input: { rowSelector: PROMPT_ROW_SELECTOR, targetName }
    });

    const editorText = await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ app, obsidianModule, promptSelector }): string {
        return document.querySelector(promptSelector) ? '' : app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '';
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the pick never wrote a link into the note',
      until: (text: string): boolean => text.includes(targetName)
    });

    expect(seededQuery).toBe(query);
    expect(editorText).toMatch(/\[\[|\]\(/);
    expect(editorText).not.toContain(`${TRIGGER}${query}`);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('keeps the trigger as plain text once a space follows it', async () => {
    const sourcePath = `Source-trigger-space-${stamp}.md`;
    await openEmptyNote(sourcePath);

    await typeIntoActiveEditor(`${TRIGGER}ada `);

    const state = await evalInObsidian({
      async callback({ app, obsidianModule, renderDelayInMilliseconds, rowSelector }): Promise<string> {
        await sleep(renderDelayInMilliseconds);
        const isOffered = document.querySelector(rowSelector) !== null;
        const text = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '';
        return `${String(isOffered)}|${text}`;
      },
      input: { renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS, rowSelector: EDITOR_SUGGEST_ROW_SELECTOR }
    });

    expect(state).toBe(`false|${TRIGGER}ada `);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

async function openEmptyNote(path: string): Promise<void> {
  await pollInObsidian({
    input: { path },
    poll({ app }): string {
      return app.workspace.getActiveFile()?.path ?? '';
    },
    async start({ app, path: notePath }): Promise<void> {
      const file = app.vault.getFileByPath(notePath) ?? await app.vault.create(notePath, '');
      await app.workspace.getLeaf(true).openFile(file, { state: { mode: 'source' } });
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: `the note ${path} never became the active file`,
    until: (activePath: string): boolean => activePath === path
  });
}

async function typeIntoActiveEditor(text: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { typeIntoEditor }, obsidianModule, text: typedText }): Promise<void> {
      const editor = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor;
      if (!editor) {
        throw new Error('No note is being edited.');
      }

      await typeIntoEditor({ editor, text: typedText });
    },
    input: { text }
  });
}

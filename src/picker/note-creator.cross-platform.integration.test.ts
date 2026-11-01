import type { TFile } from 'obsidian';

import {
  ContextId,
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * A note creator registered through the published API, against a real Obsidian: the plugin's own
 * `Insert link...` command, which nobody can hand a function, creates its note through the one the
 * `Note creator` setting names rather than through the built-in empty note.
 *
 * The API is read STRUCTURALLY out of the shared registry, for the reason `api.cross-platform` gives: a
 * script in a vault holds no library copy, and that is the consumer this method exists for.
 *
 * The registration lives across several host round trips, so it is held on a `ContextId`, and it and the
 * setting are both undone in a Node `finally`, so a failure mid-flow cannot leave the next suite's
 * `Create new` going through a note creator it never asked for.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';

/**
 * A render settle, short enough to sit inside an act closure without approaching the per-eval cap.
 */
const RENDER_DELAY_IN_MILLISECONDS = 400;

/**
 * Generous for the reason every suite here gives: Android sets the floor, and an aged emulator is slow.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * Above the sum of the budgets used below, so a genuine stall reports the NAMED poll timeout.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

interface ApiLike {
  readonly registerNoteCreator: (name: string, createNote: (folderPath: string, newNoteTitle: string) => Promise<TFile>) => RegistrationLike;
}

interface NoteCreatorResult {
  readonly content: string;
  readonly editorText: string;
  readonly isBuiltInNotePresent: boolean;
}

interface NoteCreatorSuiteContext {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Set by the registering closure, read by the disposing one.
  registration?: RegistrationLike;
}

interface PluginWithSettings {
  readonly pluginSettingsComponent: SettingsComponentLike;
}

interface RecordLike {
  readonly api: ApiLike;
  readonly isRevoked: boolean;
}

interface RegistrationLike {
  readonly dispose: () => void;
}

interface RegistryLike {
  readonly records: Record<string, RecordLike[] | undefined>;
}

interface SettingsComponentLike {
  readonly saveToFile: () => Promise<void>;
  readonly setProperty: (propertyName: string, value: unknown) => Promise<string>;
  readonly settings: SettingsLike;
}

interface SettingsLike {
  readonly noteCreatorName: string;
}

interface StateBagWindow {
  readonly __obsidianLib?: Record<string, StateEntryLike | undefined>;
}

interface StateEntryLike {
  readonly value?: RegistryLike;
}

describe('A note creator registered through the API', () => {
  it('creates the note `Insert link...` asks for when the setting names it', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const newName = `Wanted-${stamp}`;
    const noteCreatorName = `creator-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;
    const contextId = new ContextId<NoteCreatorSuiteContext>();

    try {
      await pollInObsidian({
        contextId,
        input: { noteCreatorName, pluginId: PLUGIN_ID },
        poll({ app, pluginId }): string {
          const plugin: unknown = app.plugins.plugins[pluginId];
          return (plugin as PluginWithSettings).pluginSettingsComponent.settings.noteCreatorName;
        },
        async start({ app, context, noteCreatorName: name, pluginId }): Promise<void> {
          const registry = (window as StateBagWindow).__obsidianLib?.['pluginApiRegistry']?.value;
          const record = registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
          if (!record) {
            throw new TypeError(`No API record was published for "${pluginId}".`);
          }

          context.registration = record.api.registerNoteCreator(
            name,
            async (folderPath: string, newNoteTitle: string): Promise<TFile> => await app.vault.create(`${folderPath ? `${folderPath}/` : ''}${newNoteTitle} made.md`, 'made by the note creator\n')
          );

          const plugin: unknown = app.plugins.plugins[pluginId];
          const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;
          await settingsComponent.setProperty('noteCreatorName', name);
          await settingsComponent.saveToFile();
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
        timeoutMessage: 'the note creator setting never took effect',
        until: (name: string): boolean => name === noteCreatorName
      });

      await pollInObsidian({
        input: { sourcePath },
        poll({ app }): string {
          return app.workspace.getActiveFile()?.path ?? '';
        },
        async start({ app, sourcePath: path }): Promise<void> {
          // The source note is deliberately empty, so a content read-back would prove nothing.
          const source = await app.vault.create(path, '');
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

      // Typed, but matching nothing, so there is no row to poll for and the settle stays inside the closure that types.
      await evalInObsidian({
        async callback({ inputSelector, newName: name, renderDelayInMilliseconds }): Promise<void> {
          await sleep(renderDelayInMilliseconds);

          const input = document.querySelector(inputSelector);
          if (!(input instanceof HTMLInputElement)) {
            throw new TypeError('The picker has no input.');
          }

          input.value = name;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(renderDelayInMilliseconds);
          input.focus();
        },
        input: {
          inputSelector: INPUT_SELECTOR,
          newName,
          renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS
        }
      });

      await evalInObsidian({
        callback({ controlSelector, label }): void {
          const buttonEl = [...document.querySelectorAll(controlSelector)]
            .find((el) => el.querySelector('span')?.textContent === label);
          if (!(buttonEl instanceof HTMLElement)) {
            throw new TypeError(`No control labelled ${label}.`);
          }

          buttonEl.click();
        },
        input: { controlSelector: CONTROL_SELECTOR, label: 'Create new' }
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

      const result = await evalInObsidian({
        async callback({ app, newName: name, obsidianModule, renderDelayInMilliseconds }): Promise<NoteCreatorResult> {
          await sleep(renderDelayInMilliseconds);

          const created = app.vault.getFileByPath(`${name} made.md`);

          return {
            content: created ? await app.vault.read(created) : '',
            editorText: app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '',
            isBuiltInNotePresent: app.vault.getFileByPath(`${name}.md`) !== null
          };
        },
        input: { newName, renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS }
      });

      expect(result.content).toBe('made by the note creator\n');
      expect(result.isBuiltInNotePresent).toBe(false);
      expect(result.editorText).toContain(`${newName} made`);
    } finally {
      await evalInObsidian({
        async callback({ app, context, pluginId }): Promise<void> {
          context.registration?.dispose();

          const plugin: unknown = app.plugins.plugins[pluginId];
          const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;
          await settingsComponent.setProperty('noteCreatorName', '');
          await settingsComponent.saveToFile();
        },
        contextId,
        input: { pluginId: PLUGIN_ID }
      });
      await contextId.dispose();
    }
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

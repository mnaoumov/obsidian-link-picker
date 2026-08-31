import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * A configured picker becomes a command of its own, against a real Obsidian — and stops being one when
 * it is removed. Commands are added and removed while the plugin stays loaded, which no unit test can
 * prove: it is Obsidian's command registry that has to agree.
 *
 * Cross-platform (G47): the manifest declares `isDesktopOnly: false`.
 */

const PLUGIN_ID = 'link-picker';
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface PickerCommandsResult {
  readonly commandIdsAfterAdding: string[];
  readonly commandIdsAfterRemoving: string[];
  readonly commandName: string;
  readonly pickerId: string;
}

interface PluginWithSettings {
  readonly pluginSettingsComponent: SettingsComponentLike;
}

interface SettingsComponentLike {
  saveToFile(): Promise<void>;
  setProperty(propertyName: string, value: unknown): Promise<string>;
}

describe('A configured picker', () => {
  it('gets its own command, and loses it when the picker is removed', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { createNote, waitUntil }, pluginId }): Promise<PickerCommandsResult> {
        const TIMEOUT_IN_MILLISECONDS = 30_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderName = `Picked-${stamp}`;
        const pickerName = `Insert person ${stamp}`;
        const pickerId = `picker-${stamp}`;

        await app.vault.createFolder(folderName);
        await createNote({
          content: '# Ada\n',
          path: `${folderName}/Ada-${stamp}.md`
        });

        const plugin: unknown = app.plugins.plugins[pluginId];
        const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;

        await settingsComponent.setProperty('pickers', [{
          folderPath: folderName,
          id: pickerId,
          includeSubfolders: false,
          name: pickerName,
          placeholder: '',
          prefix: 'Person: ',
          shouldAllowCreate: true
        }]);
        await settingsComponent.saveToFile();

        const commandId = `${pluginId}:picker-${pickerId}`;
        await waitUntil({
          message: 'the picker\'s command is registered',
          predicate: () => Object.hasOwn(app.commands.commands, commandId),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        const commandIdsAfterAdding = Object.keys(app.commands.commands).filter((id) => id.startsWith(`${pluginId}:picker-`));
        const commandName = app.commands.commands[commandId]?.name ?? '';

        await settingsComponent.setProperty('pickers', []);
        await settingsComponent.saveToFile();
        await waitUntil({
          message: 'the picker\'s command is gone',
          predicate: () => !Object.hasOwn(app.commands.commands, commandId),
          timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
        });

        const commandIdsAfterRemoving = Object.keys(app.commands.commands).filter((id) => id.startsWith(`${pluginId}:picker-`));

        return { commandIdsAfterAdding, commandIdsAfterRemoving, commandName, pickerId };
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.commandIdsAfterAdding).toEqual([`link-picker:picker-${result.pickerId}`]);
    expect(result.commandName).toContain('Insert person');
    expect(result.commandIdsAfterRemoving).toEqual([]);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

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
 * A configured picker becomes a command of its own, against a real Obsidian — and stops being one when
 * it is removed. Commands are added and removed while the plugin stays loaded, which no unit test can
 * prove: it is Obsidian's command registry that has to agree.
 *
 * Cross-platform: the manifest declares `isDesktopOnly: false`.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of registry reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so the two 30 s waits this flow declared
 * shared one budget neither could have. `pollInObsidian` is what makes 60 s each real: every poll is its
 * own short eval, and `until` runs in Node, where the command id this test already holds is.
 */

const PLUGIN_ID = 'link-picker';

/**
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's: Android
 * sets the floor, not desktop, and a settings save has to reach disk and come back through the watcher.
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

describe('A configured picker', () => {
  it('gets its own command, and loses it when the picker is removed', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const folderName = `Picked-${stamp}`;
    const pickerName = `Insert person ${stamp}`;
    const pickerId = `picker-${stamp}`;
    const commandId = `${PLUGIN_ID}:picker-${pickerId}`;

    await pollInObsidian({
      input: { folderName, stamp },
      poll({ app, folderName: folder, stamp: suffix }): boolean {
        return app.vault.getFileByPath(`${folder}/Ada-${suffix}.md`) !== null;
      },
      async start({ app, folderName: folder, lib: { createNote }, stamp: suffix }): Promise<void> {
        await app.vault.createFolder(folder);
        await createNote({
          content: '# Ada\n',
          path: `${folder}/Ada-${suffix}.md`
        });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the staged note never appeared in the vault',
      until: (isPresent: boolean): boolean => isPresent
    });

    const commandIdsAfterAdding = await pollInObsidian({
      input: { folderName, pickerId, pickerName, pluginId: PLUGIN_ID },
      poll({ app, pluginId }): string[] {
        return Object.keys(app.commands.commands).filter((id) => id.startsWith(`${pluginId}:picker-`));
      },
      async start({ app, folderName: folder, pickerId: id, pickerName: name, pluginId }): Promise<void> {
        const plugin: unknown = app.plugins.plugins[pluginId];
        const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;

        await settingsComponent.setProperty('pickers', [{
          folderPath: folder,
          id,
          includeSubfolders: false,
          name,
          placeholder: '',
          prefix: 'Person: ',
          shouldAllowCreate: true
        }]);
        await settingsComponent.saveToFile();
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker\'s command was never registered',
      until: (commandIds: string[]): boolean => commandIds.includes(commandId)
    });

    const commandName = await evalInObsidian({
      callback({ app, commandId: id }): string {
        return app.commands.commands[id]?.name ?? '';
      },
      input: { commandId }
    });

    const commandIdsAfterRemoving = await pollInObsidian({
      input: { pluginId: PLUGIN_ID },
      poll({ app, pluginId }): string[] {
        return Object.keys(app.commands.commands).filter((id) => id.startsWith(`${pluginId}:picker-`));
      },
      async start({ app, pluginId }): Promise<void> {
        const plugin: unknown = app.plugins.plugins[pluginId];
        const settingsComponent = (plugin as PluginWithSettings).pluginSettingsComponent;

        await settingsComponent.setProperty('pickers', []);
        await settingsComponent.saveToFile();
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker\'s command was never removed',
      until: (commandIds: string[]): boolean => !commandIds.includes(commandId)
    });

    expect(commandIdsAfterAdding).toEqual([commandId]);
    expect(commandName).toContain('Insert person');
    expect(commandIdsAfterRemoving).toEqual([]);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

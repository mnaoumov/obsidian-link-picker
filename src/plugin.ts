import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { publishPluginApi } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { InsertLinkEditorCommandHandler } from './command-handlers/insert-link-editor-command-handler.ts';
import {
  LINK_PICKER_API_CONTRACT,
  LINK_PICKER_API_VERSION,
  LinkPickerApi
} from './link-picker-api.ts';
import { LinkPickerComponent } from './link-picker-component.ts';
import { PickerCommandsComponent } from './picker-commands-component.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

export class Plugin extends PluginBase {
  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
      })
    );

    const linkPickerComponent = this.addChild(
      new LinkPickerComponent({
        app: this.app,
        pluginSettingsComponent
      })
    );

    // The half of the plugin the extraction was actually for.
    // The 17 Templater templates it came from all want the STRING, not an edit at a cursor, so a
    // Command-only plugin would serve none of them.
    // `publishPluginApi` registers its own revocation on the plugin, so unloading takes the API away.
    publishPluginApi<LinkPickerApi>({
      api: new LinkPickerApi(linkPickerComponent),
      apiVersion: LINK_PICKER_API_VERSION,
      contract: LINK_PICKER_API_CONTRACT,
      plugin: this
    });

    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new InsertLinkEditorCommandHandler({
        linkPickerComponent,
        picker: null
      }),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);

    // Registered after the generic command, and separately, because these come and go with the settings
    // While the generic one is always there.
    this.addChild(
      new PickerCommandsComponent({
        commandHandlerComponent: this.commandHandlerComponent,
        linkPickerComponent,
        pluginSettingsComponent
      })
    );
  }
}

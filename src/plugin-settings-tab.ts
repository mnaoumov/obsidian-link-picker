import type { SettingDefinitionItem } from 'obsidian';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

type PluginSettingsTabConstructorParams = PluginSettingsTabBaseConstructorParams<PluginSettings>;

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: 'Where a folder\'s folder note lives. `Auto` reads the installed `folder-notes` plugin\'s configuration, so a vault that already has folder notes needs nothing here.',
        name: 'Folder note location',
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({
              [FolderNoteLocation.Auto]: 'Auto',
              [FolderNoteLocation.InsideFolder]: 'Inside the folder',
              [FolderNoteLocation.None]: 'The vault has no folder notes',
              [FolderNoteLocation.ParentFolder]: 'Beside the folder'
            });
            this.bind({ propertyName: 'folderNoteLocation', valueComponent: dropdown });
          });
        }
      }),
      this.settingEx({
        desc: 'The folder note\'s name, without extension. Leave empty to name it after its folder.',
        name: 'Folder note name',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'folderNoteName', valueComponent: text })
              .setPlaceholder('The folder\'s own name');
          });
        },
        visible: () => this.pluginSettingsComponent.settings.folderNoteLocation !== FolderNoteLocation.Auto
      }),
      this.settingEx({
        desc: 'Paths containing any of these are hidden from the picker. Substrings, not patterns — e.g. `/attachments`.',
        name: 'Excluded paths',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'excludedPathPatterns', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: 'Frontmatter property holding a note\'s last-updated timestamp, used when sorting by updated date. Leave empty to use the file\'s modification time.',
        name: 'Updated property',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'updatedPropertyName', valueComponent: text })
              .setPlaceholder('The file\'s modification time');
          });
        }
      }),
      this.settingEx({
        desc: 'Frontmatter property holding a note\'s display title, used as the alias of a note the picker creates. Leave empty to use the file name.',
        name: 'Title property',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'titlePropertyName', valueComponent: text })
              .setPlaceholder('The file name');
          });
        }
      })
    ];
  }
}

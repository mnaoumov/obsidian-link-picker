import type {
  SettingDefinitionItem,
  SettingDefinitionList,
  SettingDefinitionPage
} from 'obsidian';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import type { ValueComponentWithChangeTracking } from 'obsidian-dev-utils/obsidian/setting-components/value-component-with-change-tracking';

import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import {
  createPicker,
  Picker
} from './plugin-settings.ts';

/**
 * Params for {@link PluginSettingsTab.bindPickerProperty}.
 *
 * @typeParam PickerPropertyName - The picker property the component edits.
 * @typeParam TValueComponent - The value component being bound.
 */
interface PluginSettingsTabBindPickerPropertyParams<
  PickerPropertyName extends keyof Picker,
  TValueComponent
> {
  /**
   * The picker's position in {@link PluginSettings.pickers}.
   */
  readonly index: number;

  /**
   * The property of that picker the component edits.
   */
  readonly pickerPropertyName: PickerPropertyName;

  /**
   * Whether this row shows the list's validation message. Only the name row does, so a single
   * complaint about the list is not repeated once per field.
   */
  readonly shouldShowValidationMessage?: boolean;

  /**
   * The component to bind.
   */
  readonly valueComponent: TValueComponent & ValueComponentWithChangeTracking<Picker[PickerPropertyName]>;
}

type PluginSettingsTabConstructorParams = PluginSettingsTabBaseConstructorParams<PluginSettings>;

/**
 * Params for {@link withPickerProperty}.
 *
 * @typeParam PickerPropertyName - The property being replaced.
 */
interface WithPickerPropertyParams<PickerPropertyName extends keyof Picker> {
  /**
   * The picker to copy.
   */
  readonly picker: Picker;

  /**
   * The property to replace in the copy.
   */
  readonly pickerPropertyName: PickerPropertyName;

  /**
   * The replacement value.
   */
  readonly value: Picker[PickerPropertyName];
}

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
      }),
      {
        desc: 'Each picker becomes its own command, preconfigured with a folder and an inline field — so a vault that picks people out of `People` and courts out of `Legal` gets two commands rather than one that asks first.',
        name: 'Pickers'
      },
      this.buildPickersList()
    ];
  }

  /**
   * Binds a component to one property of one picker.
   *
   * {@link PluginSettingsTabBase.bind} is keyed on a TOP-LEVEL settings property, and a picker's fields
   * are two levels down. Rather than bypass it — which would also bypass validation, the transformers
   * and the debounced save — every picker row binds the `pickers` array itself and converts in both
   * directions, reading one field out of one element and writing a whole new array back. This helper is
   * the single place that indexing lives.
   *
   * @typeParam PickerPropertyName - The picker property the component edits.
   * @typeParam TValueComponent - The value component being bound.
   * @param params - The params.
   */
  private bindPickerProperty<
    PickerPropertyName extends keyof Picker,
    TValueComponent
  >(params: PluginSettingsTabBindPickerPropertyParams<PickerPropertyName, TValueComponent>): void {
    this.bind({
      componentToPluginSettingsValueConverter: (value: Picker[PickerPropertyName]): readonly Picker[] =>
        this.getPickers().map((picker, index) =>
          index === params.index
            ? withPickerProperty({
              picker,
              pickerPropertyName: params.pickerPropertyName,
              value
            })
            : picker
        ),
      pluginSettingsToComponentValueConverter: (): Picker[PickerPropertyName] => getPicker(this.getPickers(), params.index)[params.pickerPropertyName],
      propertyName: 'pickers',

      // The default is the empty list, which has no field to show as a placeholder.
      shouldShowPlaceholderForDefaultValues: false,

      shouldShowValidationMessage: params.shouldShowValidationMessage ?? false,
      valueComponent: params.valueComponent
    });
  }

  /**
   * Builds the page a picker is edited on, reached from its row in the list.
   *
   * @param picker - The picker.
   * @param index - Its position in {@link PluginSettings.pickers}.
   * @returns The page definition.
   */
  private buildPickerPage(picker: Picker, index: number): SettingDefinitionPage {
    return {
      displayValue: (): string => picker.folderPath || 'The whole vault',
      items: [
        this.settingEx({
          desc: 'What the picker\'s command is called. Two pickers cannot share one.',
          name: 'Name',
          render: (setting) => {
            setting.addText((text) => {
              this.bindPickerProperty({
                index,
                pickerPropertyName: 'name',
                shouldShowValidationMessage: true,
                valueComponent: text
              });
              text.setPlaceholder('Insert person');
            });
          }
        }),
        this.settingEx({
          desc: 'The folder the picker opens rooted at. Leave empty for the whole vault. It is a starting point, not a fence — `..` still navigates out of it.',
          name: 'Folder',
          render: (setting) => {
            setting.addText((text) => {
              this.bindPickerProperty({
                index,
                pickerPropertyName: 'folderPath',
                valueComponent: text
              });
              text.setPlaceholder('The whole vault');
            });
          }
        }),
        this.settingEx({
          desc: 'Whether the picker starts with subfolder contents included. `Alt + 3` toggles it while the picker is open either way.',
          name: 'Include subfolders',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bindPickerProperty({
                index,
                pickerPropertyName: 'includeSubfolders',
                valueComponent: toggle
              });
            });
          }
        }),
        this.settingEx({
          desc: 'Emitted before the link, as `<field>: <link>`, so the result drops straight into a note\'s property list. Leave empty for the link alone.',
          name: 'Inline field',
          render: (setting) => {
            setting.addText((text) => {
              this.bindPickerProperty({
                index,
                pickerPropertyName: 'inlineField',
                valueComponent: text
              });
              text.setPlaceholder('The link alone');
            });
          }
        }),
        this.settingEx({
          desc: 'The picker\'s placeholder text. Leave empty to fall back to the inline field, then to a generic prompt.',
          name: 'Placeholder',
          render: (setting) => {
            setting.addText((text) => {
              this.bindPickerProperty({
                index,
                pickerPropertyName: 'placeholder',
                valueComponent: text
              });
              text.setPlaceholder('The inline field');
            });
          }
        }),
        this.settingEx({
          desc: 'Whether `Shift + Enter` offers to create a note that does not exist yet.',
          name: 'Allow creating notes',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bindPickerProperty({
                index,
                pickerPropertyName: 'shouldAllowCreate',
                valueComponent: toggle
              });
            });
          }
        })
      ],
      name: picker.name || 'Unnamed picker',
      type: 'page'
    };
  }

  /**
   * Builds the list of configured pickers.
   *
   * @returns The list definition.
   */
  private buildPickersList(): SettingDefinitionList {
    const pickers = this.getPickers();

    return {
      addItem: {
        action: (): void => {
          this.setPickers([...pickers, createPicker()]);
        },
        name: 'Add picker'
      },
      emptyState: 'No pickers yet. The generic `Insert link...` command works without one.',
      items: pickers.map((picker, index) => this.buildPickerPage(picker, index)),
      onDelete: (index: number): void => {
        this.setPickers(pickers.filter((_picker, pickerIndex) => pickerIndex !== index));
      },
      onReorder: (oldIndex: number, newIndex: number): void => {
        const reordered = [...pickers];
        reordered.splice(newIndex, 0, ...reordered.splice(oldIndex, 1));
        this.setPickers(reordered);
      },
      type: 'list'
    };
  }

  /**
   * Reads the pickers the user has typed, rather than the validated ones.
   *
   * The tab edits input values: a list that currently fails validation still has to be visible and
   * editable, which is the only way the user can fix it.
   *
   * @returns The pickers.
   */
  private getPickers(): readonly Picker[] {
    return this.pluginSettingsComponent.settingsState.inputValues.pickers;
  }

  /**
   * Replaces the whole picker list and re-renders the tab.
   *
   * Adding, deleting and reordering all change the tab's STRUCTURE, which is what
   * {@link PluginSettingsTabBase.refresh} is for — {@link PluginSettingsTabBase.refreshDomState} only
   * re-evaluates the visibility and disabled predicates of rows that already exist.
   *
   * @param pickers - The new list.
   */
  private setPickers(pickers: readonly Picker[]): void {
    invokeAsyncSafely(async () => {
      await this.pluginSettingsComponent.setProperty('pickers', pickers);
      this.refresh();
    });
  }
}

/**
 * Reads one picker out of the list.
 *
 * Indexed access is `Picker | undefined` under `noUncheckedIndexedAccess`, and every index here comes
 * from mapping over the very list being read — so the miss is impossible rather than merely unlikely,
 * and throwing keeps it out of the coverage gate as a branch that can never be taken.
 *
 * @param pickers - The list.
 * @param index - The position to read.
 * @returns The picker.
 */
function getPicker(pickers: readonly Picker[], index: number): Picker {
  const picker = pickers[index];

  if (!picker) {
    throw new Error(`No picker at index ${String(index)}.`);
  }

  return picker;
}

/**
 * Copies a picker with one property replaced.
 *
 * @typeParam PickerPropertyName - The property being replaced.
 * @param params - The params.
 * @returns The copy.
 */
function withPickerProperty<PickerPropertyName extends keyof Picker>(params: WithPickerPropertyParams<PickerPropertyName>): Picker {
  const copy = new Picker();
  Object.assign(copy, params.picker);
  copy[params.pickerPropertyName] = params.value;
  return copy;
}

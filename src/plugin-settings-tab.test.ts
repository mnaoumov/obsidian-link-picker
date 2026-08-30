import type {
  App as AppOriginal,
  Plugin,
  SettingDefinition,
  SettingDefinitionItem,
  SettingDefinitionList,
  SettingDefinitionPage,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import {
  enableAsyncOperationTracking,
  waitForAllAsyncOperations
} from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Picker } from './plugin-settings.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import {
  createPicker,
  PluginSettings
} from './plugin-settings.ts';

/**
 * The parts of a `bind` call this test reads back.
 *
 * Declared here rather than imported: the library's own params type is not exported, and only these
 * four members are what a picker row's binding is asserted on.
 */
interface CapturedBinding {
  componentToPluginSettingsValueConverter?(value: unknown): unknown;
  pluginSettingsToComponentValueConverter?(value: unknown): unknown;
  propertyName: string;
  shouldShowValidationMessage?: boolean;
}

const EXPECTED_TOP_LEVEL_PROPERTY_NAMES = [
  'folderNoteLocation',
  'folderNoteName',
  'excludedPathPatterns',
  'updatedPropertyName',
  'titlePropertyName'
];

let app: AppOriginal;
let inputValues: PluginSettings;
let setProperty: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  inputValues = new PluginSettings();
  setProperty = vi.fn(() => Promise.resolve(''));
  vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((params) => params.valueComponent);
  vi.spyOn(PluginSettingsTab.prototype, 'refresh').mockImplementation(() => undefined);
});

describe('PluginSettingsTab', () => {
  it('should declare a row for every top-level setting, plus the pickers list', () => {
    const tab = createTab();

    renderRows(tab);

    expect(boundPropertyNames().filter((name) => name !== 'pickers')).toEqual(EXPECTED_TOP_LEVEL_PROPERTY_NAMES);
  });

  it('should hide the folder-note name while the location is read from the folder-notes plugin', () => {
    const row = findRow(createTab(), 'Folder note name');

    expect(isRowVisible(row)).toBe(false);
  });

  it('should show the folder-note name once the location is set by hand', () => {
    inputValues.folderNoteLocation = FolderNoteLocation.InsideFolder;

    expect(isRowVisible(findRow(createTab(), 'Folder note name'))).toBe(true);
  });

  describe('pickers list', () => {
    it('should say so when there are none, and point at the command that works anyway', () => {
      expect(pickersList(createTab()).emptyState).toBe('No pickers yet. The generic `Insert link...` command works without one.');
    });

    it('should give each configured picker its own page', () => {
      inputValues.pickers = [namedPicker('People'), namedPicker('Courts')];

      expect(pickerPages(createTab()).map((page) => page.name)).toEqual(['People', 'Courts']);
    });

    it('should name a picker that has not been named yet, so its row is still clickable', () => {
      inputValues.pickers = [createPicker()];

      expect(pickerPages(createTab())[0]?.name).toBe('Unnamed picker');
    });

    it('should surface the picker\'s folder on its row, so the list reads without opening anything', () => {
      const picker = namedPicker('People');
      picker.folderPath = 'People';
      inputValues.pickers = [picker];

      expect(displayValueOf(pickerPages(createTab())[0])).toBe('People');
    });

    it('should say `The whole vault` for a picker with no folder', () => {
      inputValues.pickers = [namedPicker('People')];

      expect(displayValueOf(pickerPages(createTab())[0])).toBe('The whole vault');
    });

    it('should append a picker with a fresh id when the add affordance is used', () => {
      const tab = createTab();

      addPicker(tab);

      const added = lastSavedPickers();
      expect(added).toHaveLength(1);
      expect(added[0]?.id).not.toBe('');
    });

    it('should keep the pickers already configured when one is added', () => {
      inputValues.pickers = [namedPicker('People')];
      const tab = createTab();

      addPicker(tab);

      expect(lastSavedPickers().map((picker) => picker.name)).toEqual(['People', '']);
    });

    it('should remove only the deleted picker', () => {
      inputValues.pickers = [namedPicker('People'), namedPicker('Courts'), namedPicker('Books')];
      const tab = createTab();

      pickersList(tab).onDelete?.(1);

      expect(lastSavedPickers().map((picker) => picker.name)).toEqual(['People', 'Books']);
    });

    it('should move a reordered picker to its new position', () => {
      inputValues.pickers = [namedPicker('People'), namedPicker('Courts'), namedPicker('Books')];
      const tab = createTab();

      pickersList(tab).onReorder?.(2, 0);

      expect(lastSavedPickers().map((picker) => picker.name)).toEqual(['Books', 'People', 'Courts']);
    });

    it('should re-render the tab after a structural change, since the rows themselves changed', async () => {
      using _tracking = enableAsyncOperationTracking();
      const tab = createTab();

      addPicker(tab);
      await waitForAllAsyncOperations();

      expect(vi.mocked(PluginSettingsTab.prototype.refresh)).toHaveBeenCalledOnce();
    });

    it('should give a picker page a row for every field of a picker', () => {
      inputValues.pickers = [namedPicker('People')];

      expect(pickerRowNames(createTab())).toEqual([
        'Name',
        'Folder',
        'Include subfolders',
        'Inline field',
        'Placeholder',
        'Allow creating notes'
      ]);
    });
  });

  describe('bindPickerProperty', () => {
    it('should read the bound field out of the picker at its index', () => {
      const first = namedPicker('People');
      const second = namedPicker('Courts');
      inputValues.pickers = [first, second];
      const tab = createTab();

      renderRows(tab);

      expect(readPickerBinding(1, 'name')).toBe('Courts');
    });

    it('should write back a whole new list with only that field replaced', () => {
      inputValues.pickers = [namedPicker('People'), namedPicker('Courts')];
      const tab = createTab();

      renderRows(tab);
      const written = writePickerBinding(1, 'name', 'Tribunals');

      expect(written.map((picker) => picker.name)).toEqual(['People', 'Tribunals']);
    });

    it('should leave the edited picker\'s other fields alone', () => {
      const picker = namedPicker('People');
      picker.folderPath = 'People';
      picker.inlineField = 'Person';
      inputValues.pickers = [picker];
      const tab = createTab();

      renderRows(tab);
      const written = writePickerBinding(0, 'name', 'Humans');

      expect(written[0]?.folderPath).toBe('People');
      expect(written[0]?.inlineField).toBe('Person');
      expect(written[0]?.id).toBe(picker.id);
    });

    it('should show the list\'s validation message on the name row only', () => {
      inputValues.pickers = [namedPicker('People')];
      const tab = createTab();

      renderRows(tab);

      expect(pickerBindingOptions(0, 'name').shouldShowValidationMessage).toBe(true);
      expect(pickerBindingOptions(0, 'folderPath').shouldShowValidationMessage).toBe(false);
    });

    it('should refuse to read a picker that is no longer there', () => {
      inputValues.pickers = [namedPicker('People')];
      const tab = createTab();

      renderRows(tab);
      const read = pickerBindingOptions(0, 'name').pluginSettingsToComponentValueConverter;
      inputValues.pickers = [];

      expect(() => read?.(castTo<never>(null))).toThrow('No picker at index 0.');
    });
  });
});

function addPicker(tab: PluginSettingsTab): void {
  pickersList(tab).addItem?.action(castTo<HTMLElement>(null));
}

function boundCalls(): CapturedBinding[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => castTo<CapturedBinding>(call[0]));
}

function boundPropertyNames(): unknown[] {
  return boundCalls().map((params) => params.propertyName);
}

function createMockSettingsComponent(): PluginSettingsComponentBase<PluginSettings> {
  const validationMessages = castTo<Record<string, string>>({});
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ asyncEventSource: { offref: vi.fn() } }),
    revalidate: vi.fn(() => Promise.resolve(validationMessages)),
    saveToFile: vi.fn(() => noopAsync()),
    setProperty: castTo<PluginSettingsComponentBase<PluginSettings>['setProperty']>(setProperty),
    get settings() {
      return inputValues;
    },
    get settingsState() {
      return {
        effectiveValues: inputValues,
        inputValues,
        validationMessages
      };
    }
  });
}

function createTab(): PluginSettingsTab {
  return new PluginSettingsTab({
    plugin: strictProxy<Plugin>({
      app,
      manifest: { id: 'link-picker' }
    }),
    pluginSettingsComponent: createMockSettingsComponent()
  });
}

function displayValueOf(page: SettingDefinitionPage | undefined): string {
  const displayValue = page?.displayValue;
  return typeof displayValue === 'function' ? displayValue() : displayValue ?? '';
}

function findRow(tab: PluginSettingsTab, name: string): SettingDefinition {
  const row = flattenRows(tab.getSettingDefinitions()).find((candidate) => candidate.name === name);

  if (!row) {
    throw new Error(`No row named ${name}.`);
  }

  return row;
}

/**
 * Flattens declared items into leaf rows, descending into lists and pages alike.
 *
 * @param items - The declared items.
 * @returns The leaf rows.
 */
function flattenRows(items: SettingDefinitionItem[]): SettingDefinition[] {
  const rows: SettingDefinition[] = [];

  for (const item of items) {
    if ('items' in item) {
      rows.push(...flattenRows(castTo<SettingDefinitionItem[]>(item.items ?? [])));
      continue;
    }

    rows.push(castTo<SettingDefinition>(item));
  }

  return rows;
}

function isRowVisible(row: SettingDefinition): boolean {
  const { visible } = row;
  return typeof visible === 'function' ? visible() : visible ?? true;
}

function lastSavedPickers(): Picker[] {
  const call = setProperty.mock.calls.at(-1);

  if (!call) {
    throw new Error('The pickers were never saved.');
  }

  return castTo<Picker[]>(call[1]);
}

function namedPicker(name: string): Picker {
  const picker = createPicker();
  picker.name = name;
  return picker;
}

function pickerBindingOptions(index: number, pickerPropertyName: keyof Picker): CapturedBinding {
  const options = boundCalls().filter((params) => params.propertyName === 'pickers')[index * PICKER_ROW_COUNT + PICKER_ROW_ORDER.indexOf(pickerPropertyName)];

  if (!options) {
    throw new Error(`No binding for picker ${String(index)} property ${pickerPropertyName}.`);
  }

  return options;
}

function pickerPages(tab: PluginSettingsTab): SettingDefinitionPage[] {
  return castTo<SettingDefinitionPage[]>(pickersList(tab).items ?? []);
}

function pickerRowNames(tab: PluginSettingsTab): string[] {
  return castTo<SettingDefinitionItem[]>(pickerPages(tab)[0]?.items ?? []).map((item) => castTo<SettingDefinition>(item).name);
}

function pickersList(tab: PluginSettingsTab): SettingDefinitionList {
  const list = tab.getSettingDefinitions().find((item) => 'type' in item && item.type === 'list');

  if (!list) {
    throw new Error('The pickers list is missing.');
  }

  return castTo<SettingDefinitionList>(list);
}

function readPickerBinding(index: number, pickerPropertyName: keyof Picker): unknown {
  return pickerBindingOptions(index, pickerPropertyName).pluginSettingsToComponentValueConverter?.(castTo<never>(null));
}

/**
 * Renders every declared row, which is what makes each one call `bind`.
 *
 * @param tab - The settings tab.
 */
function renderRows(tab: PluginSettingsTab): void {
  for (const row of flattenRows(tab.getSettingDefinitions())) {
    if (!('render' in row)) {
      continue;
    }

    row.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
  }
}

function writePickerBinding(index: number, pickerPropertyName: keyof Picker, value: unknown): Picker[] {
  return castTo<Picker[]>(pickerBindingOptions(index, pickerPropertyName).componentToPluginSettingsValueConverter?.(value));
}

/**
 * The picker fields, in the order their rows are declared — which is the order their `bind` calls
 * arrive in, and therefore how a binding is addressed above.
 */
const PICKER_ROW_ORDER: (keyof Picker)[] = [
  'name',
  'folderPath',
  'includeSubfolders',
  'inlineField',
  'placeholder',
  'shouldAllowCreate'
];

const PICKER_ROW_COUNT = PICKER_ROW_ORDER.length;

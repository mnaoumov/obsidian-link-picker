import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type {
  Editor,
  MarkdownFileInfo,
  TFile
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  LinkPickerComponent,
  LinkPickerComponentSelectParams
} from '../picker/link-picker-component.ts';

import {
  createPicker,
  PluginSettings
} from '../settings/plugin-settings.ts';
import { InsertLinkEditorCommandHandler } from './insert-link-editor-command-handler.ts';

interface TestableHandler {
  readonly executeEditor: (editor: Editor, context: MarkdownFileInfo) => Promise<void>;
  readonly icon: string;
  readonly id: string;
  readonly name: string;
}

describe('InsertLinkEditorCommandHandler', () => {
  describe('the generic command', () => {
    it('should be the plain `Insert link...`', () => {
      const handler = createHandler(null);

      expect(handler.id).toBe('insert-link');
      expect(handler.name).toBe('Insert link...');
      expect(handler.icon).toBe('lucide-link');
    });

    it('should open the picker over the whole vault, with nothing preconfigured', async () => {
      const select = vi.fn(() => Promise.resolve('[[Note]]'));

      await createHandler(null, select).executeEditor(createEditor(''), createContext());

      expect(lastOptions(select).noteCreatorName).toBe('');
      expect(lastOptions(select).folderPath).toBe('');
      expect(lastOptions(select).includeSubfolders).toBe(false);
      expect(lastOptions(select).placeholder).toBe('');
      expect(lastOptions(select).prefix).toBe('');
      expect(lastOptions(select).suffix).toBe('');
      expect(lastOptions(select).shouldAllowCreate).toBe(true);
      expect(lastOptions(select).shouldApplyPrefixSuffixWhenNoLinkSelected).toBe(false);
    });
  });

  describe('a configured picker\'s command', () => {
    it('should be named after the picker but identified by its id, so a rename keeps the hotkey', () => {
      const picker = createPicker();
      picker.name = 'Insert person';

      const handler = createHandler(picker);

      expect(handler.id).toBe(`picker-${picker.id}`);
      expect(handler.name).toBe('Insert person');
    });

    it('should open the picker preconfigured the way its settings say', async () => {
      const picker = createPicker();
      picker.noteCreatorName = 'person';
      picker.folderPath = 'People';
      picker.includeSubfolders = true;
      picker.placeholder = 'Who?';
      picker.prefix = 'Person: ';
      picker.shouldAllowCreate = false;
      picker.shouldApplyPrefixSuffixWhenNoLinkSelected = true;
      picker.suffix = ' (done)';
      const select = vi.fn(() => Promise.resolve('Person: [[Ada]]'));

      await createHandler(picker, select).executeEditor(createEditor(''), createContext());

      expect(lastOptions(select).noteCreatorName).toBe('person');
      expect(lastOptions(select).folderPath).toBe('People');
      expect(lastOptions(select).includeSubfolders).toBe(true);
      expect(lastOptions(select).placeholder).toBe('Who?');
      expect(lastOptions(select).prefix).toBe('Person: ');
      expect(lastOptions(select).suffix).toBe(' (done)');
      expect(lastOptions(select).shouldAllowCreate).toBe(false);
      expect(lastOptions(select).shouldApplyPrefixSuffixWhenNoLinkSelected).toBe(true);
    });
  });

  it('should seed the query with the selection, so the picker opens already filtered', async () => {
    const select = vi.fn(() => Promise.resolve('[[Ada]]'));

    await createHandler(null, select).executeEditor(createEditor('Ada'), createContext());

    expect(lastOptions(select).initialQuery).toBe('Ada');
  });

  it('should generate the link relative to the note being edited', async () => {
    const select = vi.fn(() => Promise.resolve('[[Ada]]'));
    const context = createContext();

    await createHandler(null, select).executeEditor(createEditor(''), context);

    expect(lastOptions(select).sourcePathOrFile).toBe(context.file);
  });

  it('should fall back to the vault root when the editor is not backed by a file', async () => {
    const select = vi.fn(() => Promise.resolve('[[Ada]]'));

    await createHandler(null, select).executeEditor(createEditor(''), strictProxy<MarkdownFileInfo>({ file: null }));

    expect(lastOptions(select).sourcePathOrFile).toBe('');
  });

  it('should replace the selection with the chosen link', async () => {
    const editor = createEditor('Ada');

    await createHandler(null, vi.fn(() => Promise.resolve('[[Ada]]'))).executeEditor(editor, createContext());

    expect(vi.mocked(editor.replaceSelection)).toHaveBeenCalledWith('[[Ada]]');
  });

  describe('the selection as display text', () => {
    it('should not pass the selection as the display text while the setting is off', async () => {
      const select = vi.fn(() => Promise.resolve('[[Ada]]'));

      await createHandler(null, select).executeEditor(createEditor('Ada'), createContext());

      expect(lastOptions(select).linkDisplayText).toBe('');
    });

    it('should pass the selection as the display text of the generic command when the top-level setting is on', async () => {
      const select = vi.fn(() => Promise.resolve('[[Ada Lovelace|Ada]]'));
      const settings = new PluginSettings();
      settings.shouldUseSelectionAsDisplayText = true;

      await createHandler(null, select, settings).executeEditor(createEditor('Ada'), createContext());

      expect(lastOptions(select).linkDisplayText).toBe('Ada');
      expect(lastOptions(select).initialQuery).toBe('Ada');
    });

    it('should follow the picker\'s own field, not the top-level setting, for a configured picker', async () => {
      const settings = new PluginSettings();
      settings.shouldUseSelectionAsDisplayText = true;
      const offPicker = createPicker();
      const onPicker = createPicker();
      onPicker.shouldUseSelectionAsDisplayText = true;
      const select = vi.fn(() => Promise.resolve('[[Ada]]'));

      await createHandler(offPicker, select, settings).executeEditor(createEditor('Ada'), createContext());
      expect(lastOptions(select).linkDisplayText).toBe('');

      await createHandler(onPicker, select, new PluginSettings()).executeEditor(createEditor('Ada'), createContext());
      expect(lastOptions(select).linkDisplayText).toBe('Ada');
    });
  });

  it('should leave the note untouched when the picker is dismissed, since that is the user declining', async () => {
    const editor = createEditor('Ada');

    await createHandler(null, vi.fn(() => Promise.reject(new Error('No link selected')))).executeEditor(editor, createContext());

    expect(vi.mocked(editor.replaceSelection)).not.toHaveBeenCalled();
  });
});

function createContext(): MarkdownFileInfo {
  return strictProxy<MarkdownFileInfo>({ file: strictProxy<TFile>({ path: 'notes/note.md' }) });
}

function createEditor(selection: string): Editor {
  return strictProxy<Editor>({
    getSelection: vi.fn(() => selection),
    replaceSelection: vi.fn()
  });
}

function createHandler(
  picker: null | ReturnType<typeof createPicker>,
  select = vi.fn(() => Promise.resolve('')),
  settings = new PluginSettings()
): TestableHandler {
  return castTo<TestableHandler>(
    new InsertLinkEditorCommandHandler({
      linkPickerComponent: strictProxy<LinkPickerComponent>({ select }),
      picker,
      pluginSettingsComponent: strictProxy<PluginSettingsComponentBase<PluginSettings>>({ settings })
    })
  );
}

function lastOptions(select: ReturnType<typeof vi.fn>): LinkPickerComponentSelectParams {
  const call = select.mock.calls.at(-1);

  if (!call) {
    throw new Error('The picker was never opened.');
  }

  return castTo<LinkPickerComponentSelectParams>(call[0]);
}

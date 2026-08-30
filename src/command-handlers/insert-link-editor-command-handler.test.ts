import type {
  App,
  Editor,
  MarkdownFileInfo,
  TFile
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinkPickerComponent } from '../link-picker-component.ts';
import type { SelectOptions } from '../select.ts';

import { createPicker } from '../plugin-settings.ts';
import { InsertLinkEditorCommandHandler } from './insert-link-editor-command-handler.ts';

interface TestableHandler {
  executeEditor(editor: Editor, context: MarkdownFileInfo): Promise<void>;
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

      expect(lastOptions(select).folderPath).toBe('');
      expect(lastOptions(select).includeSubfolders).toBe(false);
      expect(lastOptions(select).inlineField).toBe('');
      expect(lastOptions(select).placeholder).toBe('');
      expect(lastOptions(select).shouldAllowCreate).toBe(true);
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
      picker.folderPath = 'People';
      picker.includeSubfolders = true;
      picker.inlineField = 'Person';
      picker.placeholder = 'Who?';
      picker.shouldAllowCreate = false;
      const select = vi.fn(() => Promise.resolve('Person: [[Ada]]'));

      await createHandler(picker, select).executeEditor(createEditor(''), createContext());

      expect(lastOptions(select).folderPath).toBe('People');
      expect(lastOptions(select).includeSubfolders).toBe(true);
      expect(lastOptions(select).inlineField).toBe('Person');
      expect(lastOptions(select).placeholder).toBe('Who?');
      expect(lastOptions(select).shouldAllowCreate).toBe(false);
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

function createHandler(picker: null | ReturnType<typeof createPicker>, select = vi.fn(() => Promise.resolve(''))): TestableHandler {
  return castTo<TestableHandler>(
    new InsertLinkEditorCommandHandler({
      app: strictProxy<App>({}),
      linkPickerComponent: strictProxy<LinkPickerComponent>({ select }),
      picker
    })
  );
}

function lastOptions(select: ReturnType<typeof vi.fn>): SelectOptions {
  const call = select.mock.calls.at(-1);

  if (!call) {
    throw new Error('The picker was never opened.');
  }

  return castTo<SelectOptions>(call[0]);
}

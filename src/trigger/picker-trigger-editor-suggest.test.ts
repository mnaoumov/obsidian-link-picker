import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  Instruction,
  TFile
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
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
import type { Picker } from '../settings/plugin-settings.ts';

import {
  createPicker,
  PluginSettings
} from '../settings/plugin-settings.ts';
import { PickerTriggerEditorSuggest } from './picker-trigger-editor-suggest.ts';

interface InstructionsProbe {
  readonly instructions__: readonly Instruction[];
}

type SelectFunction = (params: LinkPickerComponentSelectParams) => Promise<string>;

interface TestEditor extends Editor {
  readonly lines: string[];
}

interface TestSuggest {
  readonly picker: Picker;
  readonly suggest: PickerTriggerEditorSuggest;
}

const FILE = strictProxy<TFile>({ path: 'notes/note.md' });

describe('PickerTriggerEditorSuggest', () => {
  describe('onTrigger', () => {
    it('should offer the picker whose trigger is typed, with what follows as the query', () => {
      const { suggest } = createSuggest();
      const editor = createEditor(['Met @ada']);

      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)).toEqual({
        end: { ch: 8, line: 0 },
        query: 'ada',
        start: { ch: 4, line: 0 }
      });
      expect(castTo<InstructionsProbe>(suggest).instructions__).toEqual([
        { command: '↵', purpose: 'open the picker' },
        { command: 'esc', purpose: 'keep @' }
      ]);
    });

    it('should stay closed in an editor not backed by a file', () => {
      const { suggest } = createSuggest();
      const editor = createEditor(['@ada']);

      expect(suggest.onTrigger(endOf(editor, 0), editor, null)).toBeNull();
    });

    it('should stay closed with no trigger typed, and with no picker owning one', () => {
      const editor = createEditor(['@ada']);

      expect(createSuggest().suggest.onTrigger(endOf(editor, 0), createEditor(['Met Ada']), FILE)).toBeNull();
      expect(createSuggest([createPicker()]).suggest.onTrigger(endOf(editor, 0), editor, FILE)).toBeNull();
    });

    it('should stay closed inside frontmatter and code', () => {
      const { suggest } = createSuggest();
      const editor = createEditor(['---', 'person: @ada']);

      expect(suggest.onTrigger(endOf(editor, 1), editor, FILE)).toBeNull();
    });

    it('should stay closed at a position dismissed with Escape, and offer it again once the trigger is gone', () => {
      const { suggest } = createSuggest();
      const editor = createEditor(['@ad']);
      const triggerInfo = suggest.onTrigger(endOf(editor, 0), editor, FILE);
      suggest.context = createContext(editor, triggerInfo?.start, triggerInfo?.end, 'ad');

      suggest.close();

      editor.lines[0] = '@ada';
      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)).toBeNull();

      editor.lines[0] = 'x';
      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)).toBeNull();

      editor.lines[0] = '@ada';
      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)?.query).toBe('ada');
    });
  });

  describe('close', () => {
    it('should not remember a position whose trigger is no longer typed, or that the caret has left', () => {
      const { suggest } = createSuggest();
      const editor = createEditor(['@ad', 'next']);

      suggest.context = createContext(editor, { ch: 0, line: 0 }, { ch: 3, line: 0 }, 'ad', { ch: 4, line: 0 });
      editor.lines[0] = '@ad ';
      suggest.close();
      editor.lines[0] = '@ad';
      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)?.query).toBe('ad');

      suggest.context = createContext(editor, { ch: 0, line: 0 }, { ch: 3, line: 0 }, 'ad', { ch: 4, line: 1 });
      suggest.close();
      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)?.query).toBe('ad');
    });

    it('should close with no context at all', () => {
      const { suggest } = createSuggest();

      suggest.close();

      expect(suggest.isOpen).toBe(false);
    });
  });

  describe('getSuggestions', () => {
    it('should give one row naming the picker and the query', () => {
      const { picker, suggest } = createSuggest();
      const editor = createEditor(['@ada']);

      expect(suggest.getSuggestions(createContext(editor, { ch: 0, line: 0 }, { ch: 4, line: 0 }, 'ada'))).toEqual([{ picker, query: 'ada' }]);
    });

    it('should give nothing once the trigger is gone', () => {
      const { suggest } = createSuggest();
      const editor = createEditor(['ada']);

      expect(suggest.getSuggestions(createContext(editor, { ch: 0, line: 0 }, { ch: 3, line: 0 }, 'ada'))).toEqual([]);
    });
  });

  describe('renderSuggestion', () => {
    it('should name the picker and what it will search for', () => {
      const { picker, suggest } = createSuggest();
      const el = createDiv();

      suggest.renderSuggestion({ picker, query: 'ada' }, el);

      expect(el.querySelector('.suggestion-title')?.textContent).toBe('People');
      expect(el.querySelector('.suggestion-note')?.textContent).toBe('Search for "ada"');
    });

    it('should say it opens the picker when nothing follows the trigger', () => {
      const { picker, suggest } = createSuggest();
      const el = createDiv();

      suggest.renderSuggestion({ picker, query: '' }, el);

      expect(el.querySelector('.suggestion-note')?.textContent).toBe('Open the picker');
    });
  });

  describe('selectSuggestion', () => {
    it('should open the picker seeded with the query, and replace the trigger and the query with the link', async () => {
      const select = vi.fn((_params: LinkPickerComponentSelectParams) => Promise.resolve('Person: [[Ada]]'));
      const { picker, suggest } = createSuggest(undefined, select);
      const editor = createEditor(['Met @ada']);
      suggest.context = createContext(editor, { ch: 4, line: 0 }, { ch: 8, line: 0 }, 'ada');

      suggest.selectSuggestion({ picker, query: 'ada' });

      await vi.waitFor(() => {
        expect(vi.mocked(editor.replaceRange)).toHaveBeenCalledWith('Person: [[Ada]]', { ch: 4, line: 0 }, { ch: 8, line: 0 });
      });
      const options = select.mock.calls.at(-1)?.[0];
      expect(options?.initialQuery).toBe('ada');
      expect(options?.folderPath).toBe('People');
      expect(options?.prefix).toBe('Person: ');
      expect(options?.linkDisplayText).toBe('');
      expect(options?.sourcePathOrFile).toBe(FILE);

      // Opening the picker is not dismissing the trigger, so the same position is offered again.
      expect(suggest.onTrigger(endOf(editor, 0), editor, FILE)?.query).toBe('ada');
    });

    it('should leave the trigger as typed when the picker is dismissed', async () => {
      const select = vi.fn(() => Promise.reject(new Error('No link selected')));
      const { picker, suggest } = createSuggest(undefined, select);
      const editor = createEditor(['@ada']);
      suggest.context = createContext(editor, { ch: 0, line: 0 }, { ch: 4, line: 0 }, 'ada');

      suggest.selectSuggestion({ picker, query: 'ada' });

      await vi.waitFor(() => {
        expect(select).toHaveBeenCalled();
      });
      await noopAsync();
      expect(vi.mocked(editor.replaceRange)).not.toHaveBeenCalled();
      expect(vi.mocked(editor.replaceSelection)).not.toHaveBeenCalled();
    });

    it('should insert at the caret instead when the trigger was changed while the picker was open', async () => {
      const editor = createEditor(['@ada']);
      const select = vi.fn(() => {
        editor.lines[0] = 'synced';
        return Promise.resolve('[[Ada]]');
      });
      const { picker, suggest } = createSuggest(undefined, select);
      suggest.context = createContext(editor, { ch: 0, line: 0 }, { ch: 4, line: 0 }, 'ada');

      suggest.selectSuggestion({ picker, query: 'ada' });

      await vi.waitFor(() => {
        expect(vi.mocked(editor.replaceSelection)).toHaveBeenCalledWith('[[Ada]]');
      });
      expect(vi.mocked(editor.replaceRange)).not.toHaveBeenCalled();
    });

    it('should do nothing without a context', () => {
      const select = vi.fn(() => Promise.resolve('[[Ada]]'));
      const { picker, suggest } = createSuggest(undefined, select);

      suggest.selectSuggestion({ picker, query: 'ada' });

      expect(select).not.toHaveBeenCalled();
    });
  });
});

function createContext(
  editor: Editor,
  start: EditorPosition | undefined,
  end: EditorPosition | undefined,
  query: string,
  cursor?: EditorPosition
): EditorSuggestContext {
  if (!start || !end) {
    throw new Error('The trigger did not match.');
  }

  vi.mocked(editor.getCursor).mockReturnValue(cursor ?? end);
  return strictProxy<EditorSuggestContext>({ editor, end, file: FILE, query, start });
}

function createEditor(lines: string[]): TestEditor {
  const editor: TestEditor = strictProxy<TestEditor>({
    getCursor: vi.fn(() => ({ ch: 0, line: 0 })),
    getLine: (line: number): string => lines[line] ?? '',
    getRange: (from: EditorPosition, to: EditorPosition): string => (lines[from.line] ?? '').slice(from.ch, to.ch),
    lines,
    replaceRange: vi.fn(),
    replaceSelection: vi.fn()
  });
  return editor;
}

function createPeoplePicker(): Picker {
  const picker = createPicker();
  picker.name = 'People';
  picker.folderPath = 'People';
  picker.prefix = 'Person: ';
  picker.trigger = '@';
  return picker;
}

function createSuggest(
  pickers?: readonly Picker[],
  select: SelectFunction = vi.fn(() => Promise.resolve(''))
): TestSuggest {
  const picker = createPeoplePicker();
  const settings = new PluginSettings();
  settings.pickers = pickers ?? [picker];

  const suggest = new PickerTriggerEditorSuggest({
    app: App.createConfigured__().asOriginalType__(),
    linkPickerComponent: strictProxy<LinkPickerComponent>({ select }),
    pluginSettingsComponent: strictProxy<PluginSettingsComponentBase<PluginSettings>>({ settings })
  });
  return { picker, suggest };
}

function endOf(editor: TestEditor, line: number): EditorPosition {
  return { ch: (editor.lines[line] ?? '').length, line };
}

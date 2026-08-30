import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  createPicker,
  Picker,
  PluginSettings
} from './plugin-settings.ts';

describe('Picker', () => {
  it('should default to the whole vault, no inline field and creation allowed', () => {
    const picker = new Picker();

    expect(picker.folderPath).toBe('');
    expect(picker.id).toBe('');
    expect(picker.includeSubfolders).toBe(false);
    expect(picker.inlineField).toBe('');
    expect(picker.name).toBe('');
    expect(picker.placeholder).toBe('');
    expect(picker.shouldAllowCreate).toBe(true);
  });
});

describe('createPicker', () => {
  it('should mint an id, which is the one thing the constructor cannot do', () => {
    expect(createPicker().id).not.toBe('');
  });

  it('should mint a different id every time, so two pickers never share a command', () => {
    expect(createPicker().id).not.toBe(createPicker().id);
  });

  it('should leave every other field at its default', () => {
    const picker = createPicker();

    expect(picker.folderPath).toBe('');
    expect(picker.includeSubfolders).toBe(false);
    expect(picker.inlineField).toBe('');
    expect(picker.name).toBe('');
    expect(picker.placeholder).toBe('');
    expect(picker.shouldAllowCreate).toBe(true);
  });
});

describe('PluginSettings', () => {
  it('should default to reading the folder-note plugin\'s own configuration', () => {
    expect(new PluginSettings().folderNoteLocation).toBe(FolderNoteLocation.Auto);
  });

  it('should default to no pickers, no exclusions and no property overrides', () => {
    const settings = new PluginSettings();

    expect(settings.excludedPathPatterns).toEqual([]);
    expect(settings.folderNoteName).toBe('');
    expect(settings.pickers).toEqual([]);
    expect(settings.titlePropertyName).toBe('');
    expect(settings.updatedPropertyName).toBe('');
  });
});

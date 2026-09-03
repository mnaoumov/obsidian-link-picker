import type {
  App,
  TFile,
  TFolder,
  Vault
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { FolderNoteConfig } from 'obsidian-dev-utils/obsidian/folder-note';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { SelectParams } from './select.ts';

import { SegmentMatchMode } from './item.ts';
import { LinkPickerComponent } from './link-picker-component.ts';
import { PluginSettings } from './plugin-settings.ts';

const { resolveFolderNoteConfig } = vi.hoisted(() => ({ resolveFolderNoteConfig: vi.fn() }));
const { getFileOrNull } = vi.hoisted(() => ({ getFileOrNull: vi.fn() }));
const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('obsidian-dev-utils/obsidian/folder-note', async (importOriginal) => ({
  ...await importOriginal<object>(),
  resolveFolderNoteConfig
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => ({
  ...await importOriginal<object>(),
  getFileOrNull
}));

vi.mock('./select.ts', () => ({ select }));

interface FolderNoteConfigLike {
  resolveName(folder: TFolder): string;
}

interface WorkspaceLike {
  getActiveFile(): null | TFile;
}

let activeFile: null | TFile;
let create: ReturnType<typeof vi.fn>;
let createFolder: ReturnType<typeof vi.fn>;
let exists: ReturnType<typeof vi.fn>;
let settings: PluginSettings;

beforeEach(() => {
  vi.clearAllMocks();
  activeFile = null;
  create = vi.fn((path: string) => Promise.resolve(fileAt(path)));
  createFolder = vi.fn(() => Promise.resolve(strictProxy<TFolder>({})));
  exists = vi.fn(() => Promise.resolve(true));
  settings = new PluginSettings();
  getFileOrNull.mockReturnValue(null);
  resolveFolderNoteConfig.mockReturnValue(strictProxy<FolderNoteConfig>({}));
  select.mockResolvedValue('[[Ada]]');
});

describe('LinkPickerComponent', () => {
  describe('resolving options', () => {
    it('should fill every gap from the settings', async () => {
      settings.excludedPathPatterns = ['/attachments'];
      settings.segmentMatchMode = SegmentMatchMode.Fuzzy;
      settings.titlePropertyName = 'title';
      settings.updatedPropertyName = 'updated';

      await createComponent().select({});

      expect(lastParams().excludedPathPatterns).toEqual(['/attachments']);
      expect(lastParams().segmentMatchMode).toBe(SegmentMatchMode.Fuzzy);
      expect(lastParams().titlePropertyName).toBe('title');
      expect(lastParams().updatedPropertyName).toBe('updated');
    });

    it('should let a caller override a setting for one call', async () => {
      settings.excludedPathPatterns = ['/attachments'];
      settings.segmentMatchMode = SegmentMatchMode.Fuzzy;

      await createComponent().select({
        excludedPathPatterns: [],
        segmentMatchMode: SegmentMatchMode.Substring,
        titlePropertyName: 'name'
      });

      expect(lastParams().excludedPathPatterns).toEqual([]);
      expect(lastParams().segmentMatchMode).toBe(SegmentMatchMode.Substring);
      expect(lastParams().titlePropertyName).toBe('name');
    });

    it('should default to the whole vault with nothing preselected', async () => {
      await createComponent().select({});

      expect(lastParams().folderPath).toBe('');
      expect(lastParams().includeSubfolders).toBe(false);
      expect(lastParams().initialQuery).toBe('');
      expect(lastParams().placeholder).toBe('');
      expect(lastParams().prefix).toBe('');
      expect(lastParams().suffix).toBe('');
      expect(lastParams().shouldAllowCreate).toBe(true);
      expect(lastParams().shouldApplyPrefixSuffixWhenNoLinkSelected).toBe(false);
    });

    it('should write the link into the active file by default', async () => {
      activeFile = fileAt('notes/note.md');

      await createComponent().select({});

      expect(lastParams().sourcePathOrFile).toBe(activeFile);
    });

    it('should fall back to the vault root when nothing is open', async () => {
      await createComponent().select({});

      expect(lastParams().sourcePathOrFile).toBe('');
    });

    it('should treat an explicitly empty source as the vault root rather than as absent', async () => {
      activeFile = fileAt('notes/note.md');

      await createComponent().select({
        sourcePathOrFile: ''
      });

      expect(lastParams().sourcePathOrFile).toBe('');
    });

    it('should return whatever the picker resolved with', async () => {
      expect(await createComponent().select({})).toBe('[[Ada]]');
    });
  });

  describe('folder notes', () => {
    it('should read the folder-notes plugin\'s own configuration by default', async () => {
      await createComponent().select({});

      expect(resolveFolderNoteConfig.mock.calls[0]?.[0]).not.toHaveProperty('location');
    });

    it('should use the configured location once the vault says where folder notes live', async () => {
      settings.folderNoteLocation = FolderNoteLocation.InsideFolder;

      await createComponent().select({});

      expect(resolveFolderNoteConfig.mock.calls[0]?.[0]).toHaveProperty('location', FolderNoteLocation.InsideFolder);
    });

    it('should name the folder note after its folder when no name is configured', async () => {
      settings.folderNoteLocation = FolderNoteLocation.InsideFolder;

      await createComponent().select({});

      expect(resolveName()(strictProxy<TFolder>({ name: 'People' }))).toBe('People');
    });

    it('should use the configured name when there is one', async () => {
      settings.folderNoteLocation = FolderNoteLocation.InsideFolder;
      settings.folderNoteName = 'index';

      await createComponent().select({});

      expect(resolveName()(strictProxy<TFolder>({ name: 'People' }))).toBe('index');
    });

    it('should accept a resolved config from the caller, so a batch of calls resolves it once', async () => {
      const folderNoteConfig = strictProxy<FolderNoteConfig>({});

      await createComponent().select({
        folderNoteConfig
      });

      expect(lastParams().folderNoteConfig).toBe(folderNoteConfig);
      expect(resolveFolderNoteConfig).not.toHaveBeenCalled();
    });
  });

  describe('the built-in createNote', () => {
    it('should link to a note that already exists rather than overwriting it', async () => {
      const existing = fileAt('People/Ada.md');
      getFileOrNull.mockReturnValue(existing);

      await createComponent().select({});

      expect(await lastParams().createNote('People', 'Ada')).toBe(existing);
      expect(create).not.toHaveBeenCalled();
    });

    it('should create the note empty, since templates are vault policy', async () => {
      await createComponent().select({});

      await lastParams().createNote('People', 'Ada');

      expect(create).toHaveBeenCalledWith('People/Ada.md', '');
    });

    it('should create the folder first when it is not there yet', async () => {
      exists.mockResolvedValue(false);
      await createComponent().select({});

      await lastParams().createNote('People', 'Ada');

      expect(createFolder).toHaveBeenCalledWith('People');
    });

    it('should not try to create the vault root', async () => {
      exists.mockResolvedValue(false);
      await createComponent().select({});

      await lastParams().createNote('', 'Ada');

      expect(createFolder).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith('Ada.md', '');
    });

    it('should step aside for a caller that has its own conventions', async () => {
      const created = fileAt('People/Ada.md');
      const createNote = vi.fn(() => Promise.resolve(created));

      await createComponent().select({
        createNote
      });

      expect(lastParams().createNote).toBe(createNote);
    });
  });
});

function createApp(): App {
  return strictProxy<App>({
    vault: strictProxy<Vault>({
      create: castTo<Vault['create']>(create),
      createFolder: castTo<Vault['createFolder']>(createFolder),
      exists: castTo<Vault['exists']>(exists)
    }),
    workspace: strictProxy<WorkspaceLike>({ getActiveFile: () => activeFile })
  });
}

function createComponent(): LinkPickerComponent {
  return new LinkPickerComponent({
    app: createApp(),
    pluginSettingsComponent: strictProxy<PluginSettingsComponentBase<PluginSettings>>({
      get settings() {
        return settings;
      }
    })
  });
}

function fileAt(path: string): TFile {
  return strictProxy<TFile>({
    basename: path.split('/').at(-1)?.replace('.md', '') ?? '',
    path
  });
}

function lastParams(): SelectParams {
  const call = select.mock.calls.at(-1);

  if (!call) {
    throw new Error('The picker was never opened.');
  }

  return castTo<SelectParams>(call[0]);
}

function resolveName(): (folder: TFolder) => string {
  return castTo<FolderNoteConfigLike>(resolveFolderNoteConfig.mock.calls[0]?.[0]).resolveName;
}

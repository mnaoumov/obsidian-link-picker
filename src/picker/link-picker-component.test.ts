import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type { FolderNoteConfig } from '@mnaoumov/obsidian-lib/folder-note';
import type {
  App,
  TFile,
  TFolder,
  Vault
} from 'obsidian';

import { FolderNoteLocation } from '@mnaoumov/obsidian-lib/folder-note';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { SelectParams } from './select.ts';

import { PluginSettings } from '../settings/plugin-settings.ts';
import { SegmentMatchMode } from './item.ts';
import { LinkPickerComponent } from './link-picker-component.ts';

const { resolveFolderNoteConfig } = vi.hoisted(() => ({ resolveFolderNoteConfig: vi.fn() }));
const { getFileOrNull } = vi.hoisted(() => ({ getFileOrNull: vi.fn() }));
const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@mnaoumov/obsidian-lib/folder-note', async (importOriginal) => ({
  ...await importOriginal<object>(),
  resolveFolderNoteConfig
}));

vi.mock('@mnaoumov/obsidian-lib/file-system', async (importOriginal) => ({
  ...await importOriginal<object>(),
  getFileOrNull
}));

vi.mock('./select.ts', () => ({ select }));

interface FolderNoteConfigLike {
  readonly resolveName: (folder: TFolder) => string;
}

interface WorkspaceLike {
  readonly getActiveFile: () => null | TFile;
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
      expect(lastParams().linkDisplayText).toBe('');
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

    it('should pass a command\'s display text through to the picker', async () => {
      await createComponent().select({ linkDisplayText: 'Ada' });

      expect(lastParams().linkDisplayText).toBe('Ada');
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
      const folderNoteConfig: FolderNoteConfig = {
        extensions: ['md'],
        isHidden: false,
        location: FolderNoteLocation.InsideFolder,
        resolveName: (): string => 'index'
      };

      await createComponent().select({
        folderNoteConfig
      });

      // Restated rather than carried through by identity, which is what the published spelling costs: the
      // caller's `location` is a plain string, so the picker reads the config into the one it works with.
      expect(lastParams().folderNoteConfig).toEqual(folderNoteConfig);
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

  describe('note creators', () => {
    it('should create through the note creator a configured picker names', async () => {
      const created = fileAt('People/L/Lovelace Ada.md');
      const createNote = vi.fn(() => Promise.resolve(created));
      const component = createComponent();
      component.registerNoteCreator('person', createNote);

      await component.select({ noteCreatorName: 'person' });

      expect(await lastParams().createNote('People', 'Ada Lovelace')).toBe(created);
      expect(createNote).toHaveBeenCalledExactlyOnceWith('People', 'Ada Lovelace');
      expect(create).not.toHaveBeenCalled();
    });

    it('should fall back to the note creator the settings name when the picker names none', async () => {
      settings.noteCreatorName = 'note';
      const createNote = vi.fn(() => Promise.resolve(fileAt('Ada.md')));
      const component = createComponent();
      component.registerNoteCreator('note', createNote);

      await component.select({ noteCreatorName: '' });
      await lastParams().createNote('', 'Ada');

      expect(createNote).toHaveBeenCalledOnce();
    });

    it('should apply the settings note creator to an API call that passes no function of its own', async () => {
      settings.noteCreatorName = 'note';
      const createNote = vi.fn(() => Promise.resolve(fileAt('Ada.md')));
      const component = createComponent();
      component.registerNoteCreator('note', createNote);

      await component.select({});
      await lastParams().createNote('', 'Ada');

      expect(createNote).toHaveBeenCalledOnce();
    });

    it('should prefer the picker\'s note creator over the settings one', async () => {
      settings.noteCreatorName = 'note';
      const noteHandler = vi.fn(() => Promise.resolve(fileAt('Ada.md')));
      const personHandler = vi.fn(() => Promise.resolve(fileAt('People/Ada.md')));
      const component = createComponent();
      component.registerNoteCreator('note', noteHandler);
      component.registerNoteCreator('person', personHandler);

      await component.select({ noteCreatorName: 'person' });
      await lastParams().createNote('People', 'Ada');

      expect(personHandler).toHaveBeenCalledOnce();
      expect(noteHandler).not.toHaveBeenCalled();
    });

    it('should look the note creator up when the note is created, so a late registration still serves an open picker', async () => {
      const createNote = vi.fn(() => Promise.resolve(fileAt('Ada.md')));
      const component = createComponent();

      await component.select({ noteCreatorName: 'person' });
      component.registerNoteCreator('person', createNote);
      await lastParams().createNote('', 'Ada');

      expect(createNote).toHaveBeenCalledOnce();
    });

    it('should refuse rather than create an empty note when the named note creator is not registered', async () => {
      await createComponent().select({ noteCreatorName: 'person' });

      await expect(lastParams().createNote('', 'Ada')).rejects.toThrow('The note creator "person" is not registered.');
      expect(create).not.toHaveBeenCalled();
    });

    it('should stop using a note creator once its registration is disposed', async () => {
      const component = createComponent();
      const registration = component.registerNoteCreator('person', vi.fn());

      registration.dispose();
      await component.select({ noteCreatorName: 'person' });

      await expect(lastParams().createNote('', 'Ada')).rejects.toThrow('is not registered');
    });

    it('should let a newer registration replace an older one, and survive the older one being disposed', async () => {
      const older = vi.fn(() => Promise.resolve(fileAt('Old.md')));
      const newer = vi.fn(() => Promise.resolve(fileAt('New.md')));
      const component = createComponent();
      const olderRegistration = component.registerNoteCreator('person', older);
      component.registerNoteCreator('person', newer);

      olderRegistration.dispose();
      await component.select({ noteCreatorName: 'person' });
      await lastParams().createNote('', 'Ada');

      expect(newer).toHaveBeenCalledOnce();
      expect(older).not.toHaveBeenCalled();
    });

    it('should refuse a blank name, which no setting could refer to', () => {
      expect(() => createComponent().registerNoteCreator(' ', vi.fn())).toThrow('A note creator needs a name');
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

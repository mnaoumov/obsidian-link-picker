import type {
  App as AppOriginal,
  KeymapEventHandler,
  TFile,
  TFolder
} from 'obsidian';
import type { FolderNoteConfig } from 'obsidian-dev-utils/obsidian/folder-note';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';
import {
  App,
  Scope,
  Vault
} from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Item } from './item.ts';
import type { SelectParams } from './select.ts';

const {
  generateMarkdownLink,
  getFrontmatterSafe,
  prompt
} = vi.hoisted(() => ({
  generateMarkdownLink: vi.fn(),
  getFrontmatterSafe: vi.fn(),
  prompt: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-context', () => ({ addPluginCssClasses: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/link', () => ({ generateMarkdownLink }));
vi.mock('obsidian-dev-utils/obsidian/modals/prompt', () => ({ prompt }));
vi.mock('obsidian-dev-utils/obsidian/metadata-cache', async (importOriginal) => ({
  ...await importOriginal<object>(),
  getFrontmatterSafe
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PARENT_RELATIVE_PATH } from './item.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkPickerModal } from './link-picker-modal.ts';

/**
 * The layout every folder-note plugin supports, and the one the picker is most often pointed at.
 */
const FOLDER_NOTE_CONFIG: FolderNoteConfig = {
  extensions: ['md'],
  isHidden: false,
  location: FolderNoteLocation.InsideFolder,
  resolveName: (folder: TFolder): string => folder.name
};

interface GenerateMarkdownLinkParams {
  readonly alias: string;
  readonly targetPathOrFile: TFile;
}

interface HotkeyRegistration {
  key: string;
  listener(event: KeyboardEvent, context: never): unknown;
  modifier: string;
  scope: unknown;
}

interface InstructionLike {
  command: string;
  purpose: string;
}

type LinkPickerModalReject = (this: void, reason: unknown) => void;

type LinkPickerModalResolve = (this: void, value: string) => void;

interface RecentFileTrackerLike {
  lastOpenFiles: string[];
}

interface RecentFileTrackerMock {
  workspace: WorkspaceWithRecentFiles;
}

interface TestableModal {
  getSuggestions(query: string): Item[];
  readonly inputEl: HTMLInputElement;
  readonly instructions__: InstructionLike[];
  onChooseSuggestion(item: Item, event: KeyboardEvent | MouseEvent): void;
  onClose(): void;
  onOpen(): void;
  renderSuggestion(item: Item, el: HTMLElement): void;
  readonly scope: unknown;
  selectSuggestion(item: Item, event: KeyboardEvent | MouseEvent): void;
}

interface WorkspaceWithRecentFiles {
  recentFileTracker: RecentFileTrackerLike;
}

let app: AppOriginal;
let appMock: App;
let registrations: HotkeyRegistration[];
let reject: ReturnType<typeof vi.fn>;
let resolve: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  registrations = [];
  vi.spyOn(Scope.prototype, 'register').mockImplementation(function captureRegistration(this: unknown, modifiers, key, listener) {
    registrations.push({
      key: key ?? '',
      listener: castTo<HotkeyRegistration['listener']>(listener),
      modifier: modifiers?.join(',') ?? '',
      scope: this
    });
    return castTo<KeymapEventHandler>({});
  });
  appMock = App.createConfigured__();
  app = appMock.asOriginalType__();
  castTo<RecentFileTrackerMock>(app).workspace.recentFileTracker = { lastOpenFiles: [] };
  reject = vi.fn();
  resolve = vi.fn();
  generateMarkdownLink.mockImplementation((params: GenerateMarkdownLinkParams) => params.alias ? `[[${params.targetPathOrFile.path}|${params.alias}]]` : `[[${params.targetPathOrFile.path}]]`);
  getFrontmatterSafe.mockResolvedValue({});
  prompt.mockResolvedValue(null);
  buildVault();
});

describe('LinkPickerModal', () => {
  describe('the placeholder', () => {
    it('should name the inline field, which is what the result is being written into', () => {
      expect(createModal({ inlineField: 'Person' }).inputEl.placeholder).toBe('Person');
    });

    it('should use an explicit placeholder when there is no inline field', () => {
      expect(createModal({ placeholder: 'Who?' }).inputEl.placeholder).toBe('Who?');
    });

    it('should fall back to a generic prompt', () => {
      expect(createModal({}).inputEl.placeholder).toBe('Select note file to link');
    });
  });

  describe('opening', () => {
    it('should seed the input with the query the caller supplied', () => {
      const modal = createModal({ initialQuery: 'Ada' });

      modal.onOpen();

      expect(modal.inputEl.value).toBe('Ada');
    });

    it('should rank a recently opened note above one that was not', () => {
      castTo<RecentFileTrackerMock>(app).workspace.recentFileTracker.lastOpenFiles = ['Notes/Bob.md'];
      const modal = createModal({ folderPath: 'Notes' });

      modal.onOpen();

      expect(relativePaths(modal.getSuggestions('')).indexOf('Bob.md')).toBeLessThan(relativePaths(modal.getSuggestions('')).indexOf('Ada.md'));
    });

    it('should keep the first position of a path Obsidian lists twice', () => {
      castTo<RecentFileTrackerMock>(app).workspace.recentFileTracker.lastOpenFiles = ['Notes/Bob.md', 'Notes/Ada.md', 'Notes/Bob.md'];
      const modal = createModal({ folderPath: 'Notes' });

      modal.onOpen();

      expect(relativePaths(modal.getSuggestions('')).indexOf('Bob.md')).toBeLessThan(relativePaths(modal.getSuggestions('')).indexOf('Ada.md'));
    });
  });

  describe('what the picker shows', () => {
    it('should list the folder\'s own contents, not the whole vault', () => {
      const modal = openModal({ folderPath: 'Notes' });

      expect(relativePaths(modal.getSuggestions(''))).toContain('Ada.md');
      expect(relativePaths(modal.getSuggestions(''))).not.toContain('Root.md');
    });

    it('should offer a way back out of a folder it was opened inside', () => {
      const modal = openModal({ folderPath: 'Notes/Deep' });

      expect(relativePaths(modal.getSuggestions(''))).toContain(PARENT_RELATIVE_PATH);
    });

    it('should offer no way out of the vault root', () => {
      const modal = openModal({});

      expect(relativePaths(modal.getSuggestions(''))).not.toContain(PARENT_RELATIVE_PATH);
    });

    it('should hide non-markdown files, which are not things you link to by name', () => {
      const modal = openModal({ folderPath: 'Notes' });

      expect(relativePaths(modal.getSuggestions(''))).not.toContain('image.png');
    });

    it('should hide a path the settings exclude', () => {
      const modal = openModal({ excludedPathPatterns: ['/Deep'] });

      expect(relativePaths(modal.getSuggestions(''))).not.toContain('Notes/Deep');
    });

    it('should ignore an empty exclusion pattern rather than hiding everything', () => {
      const modal = openModal({ excludedPathPatterns: [''] });

      expect(relativePaths(modal.getSuggestions('')).length).toBeGreaterThan(0);
    });

    it('should show a nested note once subfolders are included', () => {
      const modal = openModal({
        folderPath: 'Notes',
        includeSubfolders: true
      });

      expect(relativePaths(modal.getSuggestions(''))).toContain('Deep/Carl.md');
    });

    it('should not list the folder it is already inside among that folder\'s own contents', () => {
      // Obsidian's own `Vault.recurseChildren` hands the callback the folder it was given BEFORE its
      // Descendants; the test mock only walks the descendants, so the real contract is restored here —
      // Without it, the folder would appear as an empty-named row inside itself.
      const { recurseChildren } = Vault;
      vi.spyOn(Vault, 'recurseChildren').mockImplementation((folder, callback) => {
        callback(folder);
        recurseChildren(folder, callback);
      });
      const modal = openModal({
        folderPath: 'Notes',
        includeSubfolders: true
      });

      expect(relativePaths(modal.getSuggestions(''))).not.toContain('');
    });

    it('should offer one row per alias, plus one for the note\'s own name', () => {
      appMock.metadataCache.setCache__('Notes/Ada.md', { frontmatter: { aliases: ['Lovelace'] } });
      const modal = openModal({ folderPath: 'Notes' });

      expect(aliasesOf(modal.getSuggestions(''), 'Ada.md')).toEqual([[], ['Lovelace']]);
    });

    it('should not offer a folder note under its own name, since its folder already reaches it', () => {
      const modal = openModal({ folderPath: 'Notes' });

      expect(aliasesOf(modal.getSuggestions(''), 'Notes.md')).toEqual([]);
    });

    it('should drop a folder alias that merely repeats the folder\'s name', () => {
      appMock.metadataCache.setCache__('Notes/Notes.md', { frontmatter: { aliases: ['Notes', 'Writing'] } });
      const modal = openModal({});

      expect(aliasesOf(modal.getSuggestions(''), 'Notes')).toEqual([['Writing']]);
    });
  });

  describe('toggles', () => {
    it('should show non-markdown files once they are asked for', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '2');

      expect(relativePaths(modal.getSuggestions(''))).toContain('image.png');
    });

    it('should reach into subfolders once they are asked for', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '3');

      expect(relativePaths(modal.getSuggestions(''))).toContain('Deep/Carl.md');
    });

    it('should show only folders once asked, so a folder can be reached without reading past its notes', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '4');

      // The way out survives the filter deliberately: the mode is for navigating, and a mode you cannot
      // Leave would be a trap.
      expect(relativePaths(modal.getSuggestions(''))).toEqual([PARENT_RELATIVE_PATH, 'Deep']);
    });

    it('should ignore the other toggles while showing only folders, since they would empty the list', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '4');
      pressHotkey(modal, 'Alt', '2');
      pressHotkey(modal, 'Alt', '3');

      expect(relativePaths(modal.getSuggestions(''))).toEqual([PARENT_RELATIVE_PATH, 'Deep']);
    });

    it('should offer only the folder-mode instructions while showing only folders', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '4');

      expect(instructionCommands(modal)).toEqual(['Alt + 4', 'Alt + 5']);
    });

    it('should not offer creation when the caller turned it off', () => {
      const modal = openModal({ shouldAllowCreate: false });

      expect(instructionCommands(modal)).not.toContain('Shift + Enter');
    });

    it('should say what each toggle would do next, not what it did', () => {
      const modal = openModal({});

      expect(instructionPurposes(modal)).toContain('Include subfolders');

      pressHotkey(modal, 'Alt', '3');

      expect(instructionPurposes(modal)).toContain('Exclude subfolders');
    });
  });

  describe('choosing', () => {
    it('should descend into a chosen folder rather than picking it', () => {
      const modal = openModal({});

      modal.onChooseSuggestion(itemFor(modal, 'Notes'), mouseEvent());

      expect(resolve).not.toHaveBeenCalled();
      expect(relativePaths(modal.getSuggestions(''))).toContain('Ada.md');
    });

    it('should leave folders-only mode when descending, since the point was to get here', () => {
      const modal = openModal({});

      pressHotkey(modal, 'Alt', '4');
      modal.onChooseSuggestion(itemFor(modal, 'Notes'), mouseEvent());

      expect(relativePaths(modal.getSuggestions(''))).toContain('Ada.md');
    });

    it('should resolve with a link to the chosen note', () => {
      const modal = openModal({ folderPath: 'Notes' });

      modal.onChooseSuggestion(itemFor(modal, 'Ada.md'), mouseEvent());

      expect(resolve).toHaveBeenCalledWith('[[Notes/Ada.md]]');
    });

    it('should prefix the inline field, so the result drops into a property list', () => {
      const modal = openModal({
        folderPath: 'Notes',
        inlineField: 'Person'
      });

      modal.onChooseSuggestion(itemFor(modal, 'Ada.md'), mouseEvent());

      expect(resolve).toHaveBeenCalledWith('Person: [[Notes/Ada.md]]');
    });

    it('should carry the picked alias into the link', () => {
      appMock.metadataCache.setCache__('Notes/Ada.md', { frontmatter: { aliases: ['Lovelace'] } });
      const modal = openModal({ folderPath: 'Notes' });

      modal.onChooseSuggestion(aliasItemFor(modal, 'Ada.md', 'Lovelace'), mouseEvent());

      expect(resolve).toHaveBeenCalledWith('[[Notes/Ada.md|Lovelace]]');
    });

    it('should navigate into a folder even while showing only folders, rather than linking to it', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '4');
      modal.selectSuggestion(itemFor(modal, 'Deep'), mouseEvent());

      expect(resolve).not.toHaveBeenCalled();
      expect(relativePaths(modal.getSuggestions(''))).toContain('Carl.md');
    });

    it('should resolve empty when the empty row is chosen, which is how you decline a link', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '1');

      expect(resolve).toHaveBeenCalledWith('');
    });

    it('should still emit the inline field when the empty row is chosen, so the property is written blank', () => {
      const modal = openModal({
        folderPath: 'Notes',
        inlineField: 'Person'
      });

      pressHotkey(modal, 'Alt', '1');

      expect(resolve).toHaveBeenCalledWith('Person: ');
    });

    it('should not offer the empty row while showing only folders', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '4');
      pressHotkey(modal, 'Alt', '1');

      expect(resolve).not.toHaveBeenCalled();
    });
  });

  describe('dismissing', () => {
    it('should reject, so a caller can tell a dismissal from an empty pick', () => {
      const modal = openModal({});

      modal.onClose();

      expect(reject).toHaveBeenCalledOnce();
    });

    it('should not reject after a pick', () => {
      const modal = openModal({ folderPath: 'Notes' });

      modal.selectSuggestion(itemFor(modal, 'Ada.md'), mouseEvent());
      modal.onClose();

      expect(reject).not.toHaveBeenCalled();
    });

    it('should reject once, however many times it is closed', () => {
      const modal = openModal({});

      modal.onClose();
      modal.onClose();

      expect(reject).toHaveBeenCalledOnce();
    });
  });

  describe('creating a note', () => {
    it('should create the note the typed text names', async () => {
      const created = createdFile('Notes/New.md');
      const createNote = vi.fn(() => Promise.resolve(created));
      const modal = openModal({
        createNote,
        folderPath: 'Notes'
      });
      modal.inputEl.value = 'New';

      await pressCreate(modal);

      expect(createNote).toHaveBeenCalledWith('Notes', 'New');
      expect(resolve).toHaveBeenCalledWith('[[Notes/New.md|New]]');
    });

    it('should ask for a title when nothing was typed', async () => {
      prompt.mockResolvedValue('Asked');
      const createNote = vi.fn(() => Promise.resolve(createdFile('Notes/Asked.md')));
      const modal = openModal({
        createNote,
        folderPath: 'Notes'
      });

      await pressCreate(modal);

      expect(createNote).toHaveBeenCalledWith('Notes', 'Asked');
    });

    it('should reject when the title prompt is dismissed', async () => {
      const modal = openModal({ folderPath: 'Notes' });

      await pressCreate(modal);

      expect(reject).toHaveBeenCalledOnce();
    });

    it('should label the new note with its title property when the vault has one', async () => {
      getFrontmatterSafe.mockResolvedValue({ title: 'The Title' });
      const modal = openModal({
        createNote: vi.fn(() => Promise.resolve(createdFile('Notes/New.md'))),
        folderPath: 'Notes',
        titlePropertyName: 'title'
      });
      modal.inputEl.value = 'New';

      await pressCreate(modal);

      expect(resolve).toHaveBeenCalledWith('[[Notes/New.md|The Title]]');
    });

    it('should fall back to the file name when the title property holds something else', async () => {
      getFrontmatterSafe.mockResolvedValue({ title: 42 });
      const modal = openModal({
        createNote: vi.fn(() => Promise.resolve(createdFile('Notes/New.md'))),
        folderPath: 'Notes',
        titlePropertyName: 'title'
      });
      modal.inputEl.value = 'New';

      await pressCreate(modal);

      expect(resolve).toHaveBeenCalledWith('[[Notes/New.md|New]]');
    });

    it('should leave `Shift + Enter` to Obsidian while showing only folders', () => {
      const modal = openModal({ folderPath: 'Notes' });

      pressHotkey(modal, 'Alt', '4');

      expect(pressHotkey(modal, 'Shift', 'Enter')).toBe(true);
    });

    it('should leave `Shift + Enter` to Obsidian when creation is turned off', () => {
      const modal = openModal({ shouldAllowCreate: false });

      expect(pressHotkey(modal, 'Shift', 'Enter')).toBe(true);
    });
  });

  describe('ordering by updated date', () => {
    it('should read the configured property', () => {
      appMock.metadataCache.setCache__('Notes/Ada.md', { frontmatter: { updated: '2020-01-01' } });
      appMock.metadataCache.setCache__('Notes/Bob.md', { frontmatter: { updated: '2030-01-01' } });
      const modal = openModal({
        folderPath: 'Notes',
        updatedPropertyName: 'updated'
      });

      expect(relativePaths(modal.getSuggestions('')).indexOf('Bob.md')).toBeLessThan(relativePaths(modal.getSuggestions('')).indexOf('Ada.md'));
    });

    it('should stop ordering by date once that is switched off', () => {
      appMock.metadataCache.setCache__('Notes/Ada.md', { frontmatter: { updated: '2020-01-01' } });
      appMock.metadataCache.setCache__('Notes/Bob.md', { frontmatter: { updated: '2030-01-01' } });
      const modal = openModal({
        folderPath: 'Notes',
        updatedPropertyName: 'updated'
      });

      pressHotkey(modal, 'Alt', '5');

      expect(relativePaths(modal.getSuggestions('')).indexOf('Ada.md')).toBeLessThan(relativePaths(modal.getSuggestions('')).indexOf('Bob.md'));
    });

    it('should ignore a property holding something that is not a timestamp', () => {
      appMock.metadataCache.setCache__('Notes/Ada.md', { frontmatter: { updated: 42 } });
      const modal = openModal({
        folderPath: 'Notes',
        updatedPropertyName: 'updated'
      });

      expect(relativePaths(modal.getSuggestions(''))).toContain('Ada.md');
    });
  });

  describe('rendering a row', () => {
    it('should mark a folder as one', () => {
      const modal = openModal({});
      const el = createDiv();

      modal.renderSuggestion(itemFor(modal, 'Notes'), el);

      expect(el.textContent).toContain('Notes');
    });

    it('should show each alias on its own line', () => {
      appMock.metadataCache.setCache__('Notes/Ada.md', { frontmatter: { aliases: ['Lovelace'] } });
      const modal = openModal({ folderPath: 'Notes' });
      const el = createDiv();

      modal.renderSuggestion(aliasItemFor(modal, 'Ada.md', 'Lovelace'), el);

      expect(el.querySelectorAll('div')).toHaveLength(1);
    });

    it('should render no alias line for the row that is the note\'s own name', () => {
      const modal = openModal({ folderPath: 'Notes' });
      const el = createDiv();

      modal.renderSuggestion(itemFor(modal, 'Ada.md'), el);

      expect(el.querySelectorAll('div')).toHaveLength(0);
    });

    it('should skip a blank alias rather than render an empty line for it', () => {
      // A folder row carries its folder note's aliases wholesale, so a blank one in the frontmatter
      // Reaches the renderer where a note row's never would.
      appMock.metadataCache.setCache__('Notes/Notes.md', { frontmatter: { aliases: ['', 'Writing'] } });
      const modal = openModal({});
      const el = createDiv();

      modal.renderSuggestion(itemFor(modal, 'Notes'), el);

      expect(el.querySelectorAll('div')).toHaveLength(1);
    });
  });

  describe('the folder note of the folder it is opened at', () => {
    it('should sort that folder note first, so the folder itself is the easiest thing to link', () => {
      const modal = openModal({
        folderPath: 'Notes/Deep',
        includeSubfolders: true
      });
      appMock.metadataCache.setCache__('Notes/Deep/Deep.md', { frontmatter: { aliases: ['Depths'] } });

      expect(relativePaths(openModal({ folderPath: 'Notes/Deep' }).getSuggestions(''))[0]).toBe(PARENT_RELATIVE_PATH);
      expect(relativePaths(modal.getSuggestions(''))).toContain('Carl.md');
    });

    it('should cope with a folder that has no folder note at all', () => {
      const modal = openModal({ folderPath: 'Notes/Deep/Empty' });

      expect(relativePaths(modal.getSuggestions(''))).toEqual([PARENT_RELATIVE_PATH]);
    });

    it('should ignore a folder note that lives beside its folder rather than inside it', () => {
      appMock.vault.createSync__('Notes/Deep2.md', '');
      appMock.vault.createFolderSync__('Notes/Deep2');
      appMock.vault.createSync__('Notes/Deep2/Inner.md', '');
      const modal = openModal({
        folderNoteConfig: {
          extensions: ['md'],
          isHidden: false,
          location: FolderNoteLocation.ParentFolder,
          resolveName: (folder: TFolder): string => folder.name
        },
        folderPath: 'Notes/Deep2'
      });

      expect(relativePaths(modal.getSuggestions(''))).toEqual([PARENT_RELATIVE_PATH, 'Inner.md']);
    });
  });

  describe('the folder path it is opened at', () => {
    it('should accept a path written with slashes around it', () => {
      const modal = openModal({ folderPath: '/Notes/' });

      expect(relativePaths(modal.getSuggestions(''))).toContain('Ada.md');
    });
  });
});

function aliasesOf(items: Item[], relativePath: string): string[][] {
  return items.filter((item) => item.relativePath === relativePath).map((item) => item.aliases);
}

function aliasItemFor(modal: TestableModal, relativePath: string, alias: string): Item {
  const item = modal.getSuggestions('').find((candidate) => candidate.relativePath === relativePath && candidate.aliases[0] === alias);

  if (!item) {
    throw new Error(`No row for ${relativePath} aliased ${alias}.`);
  }

  return item;
}

/**
 * Builds the vault every test reads.
 *
 * `Notes` and `Notes/Deep` carry folder notes named after themselves; `Notes/Deep/Empty` deliberately
 * does not, which is the only way to exercise a folder that cannot be linked.
 */
function buildVault(): void {
  appMock.vault.createFolderSync__('Notes');
  appMock.vault.createSync__('Notes/Notes.md', '');
  appMock.vault.createSync__('Notes/Ada.md', '');
  appMock.vault.createSync__('Notes/Bob.md', '');
  appMock.vault.createSync__('Notes/image.png', '');
  appMock.vault.createFolderSync__('Notes/Deep');
  appMock.vault.createSync__('Notes/Deep/Deep.md', '');
  appMock.vault.createSync__('Notes/Deep/Carl.md', '');
  appMock.vault.createFolderSync__('Notes/Deep/Empty');
  appMock.vault.createSync__('Root.md', '');
}

function createdFile(path: string): TFile {
  return castTo<TFile>(appMock.vault.createSync__(path, '').asOriginalType__());
}

function createModal(options: Partial<SelectParams>): TestableModal {
  return castTo<TestableModal>(
    new LinkPickerModal({
      options: {
        app,
        createNote: vi.fn(() => Promise.resolve(createdFile('New.md'))),
        excludedPathPatterns: [],
        folderNoteConfig: FOLDER_NOTE_CONFIG,
        folderPath: '',
        includeSubfolders: false,
        initialQuery: '',
        inlineField: '',
        placeholder: '',
        shouldAllowCreate: true,
        sourcePathOrFile: '',
        titlePropertyName: '',
        updatedPropertyName: '',
        ...options
      },
      reject: castTo<LinkPickerModalReject>(reject),
      resolve: castTo<LinkPickerModalResolve>(resolve)
    })
  );
}

function instructionCommands(modal: TestableModal): string[] {
  return modal.instructions__.map((instruction) => instruction.command);
}

function instructionPurposes(modal: TestableModal): string[] {
  return modal.instructions__.map((instruction) => instruction.purpose);
}

function itemFor(modal: TestableModal, relativePath: string): Item {
  const item = modal.getSuggestions('').find((candidate) => candidate.relativePath === relativePath);

  if (!item) {
    throw new Error(`No row for ${relativePath}.`);
  }

  return item;
}

function mouseEvent(): MouseEvent {
  return new MouseEvent('click');
}

function openModal(options: Partial<SelectParams>): TestableModal {
  const modal = createModal(options);
  modal.onOpen();
  return modal;
}

async function pressCreate(modal: TestableModal): Promise<void> {
  pressHotkey(modal, 'Shift', 'Enter');
  await vi.waitFor(() => {
    expect(resolve.mock.calls.length + reject.mock.calls.length).toBeGreaterThan(0);
  });
}

/**
 * Fires a registered hotkey the way Obsidian's scope does.
 *
 * The scope mock records which key was registered but not what it was registered to run, so the
 * listeners are captured off `register` itself.
 *
 * @param modal - The modal the hotkey belongs to.
 * @param modifier - The modifier it was registered with.
 * @param key - The key.
 * @returns Whatever the listener returned, which is how one declines to consume the key.
 */
function pressHotkey(modal: TestableModal, modifier: string, key: string): unknown {
  const registration = registrations.find((candidate) => candidate.scope === modal.scope && candidate.modifier === modifier && candidate.key === key);

  if (!registration) {
    throw new Error(`No hotkey registered for ${modifier} + ${key}.`);
  }

  return registration.listener(new KeyboardEvent('keydown'), castTo<never>({}));
}

function relativePaths(items: Item[]): string[] {
  return items.map((item) => item.relativePath);
}

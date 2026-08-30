import type {
  FrontMatterCache,
  KeymapEventHandler,
  TAbstractFile,
  TFile
} from 'obsidian';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import {
  getIcon,
  parseFrontMatterAliases,
  Platform,
  SuggestModal,
  Vault
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import {
  asFile,
  getFolder,
  isFile,
  isFolder
} from 'obsidian-dev-utils/obsidian/file-system';
import { resolveFolderNote } from 'obsidian-dev-utils/obsidian/folder-note';
import { generateMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { getFrontmatterSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { addPluginCssClasses } from 'obsidian-dev-utils/obsidian/plugin/plugin-context';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { Item } from './item.ts';
import type { SelectParams } from './select.ts';

import {
  fillLowerCaseFields,
  PARENT_RELATIVE_PATH,
  sortItems
} from './item.ts';

/**
 * How many recently-opened files to rank above the rest. Obsidian's own list is longer than the ten it
 * shows, and a picker scoped to one folder can easily have more than ten recent hits in it.
 */
const RECENT_FILE_PATHS_MAX_COUNT = 50;

interface LinkPickerModalConstructorParams {
  readonly options: SelectParams;
  reject(this: void, reason: unknown): void;
  resolve(this: void, value: string): void;
}

/**
 * One button in the strip along the bottom of the picker.
 *
 * The same six things the hotkeys do, reachable by pointer — which on a phone is the ONLY way to reach
 * them, since there is no `Alt` key to press. The hotkey remains the faster route where a keyboard
 * exists, so the two are two ways into one handler rather than two behaviors.
 */
interface PickerControl {
  /**
   * Runs the control. The event is the click, so a control that picks something has one to hand on.
   */
  activate(this: void, event_: MouseEvent): void;

  /**
   * Whether the control can be used right now. An unavailable one is disabled rather than removed, so
   * the strip does not reflow under the pointer as modes change.
   */
  checkIsAvailable(this: void): boolean;

  /**
   * Whether a TOGGLE is currently on. Absent on the two controls that are actions rather than state.
   */
  checkIsOn?(this: void): boolean;

  /**
   * The hotkey that does the same thing, shown only where one can be pressed.
   */
  readonly hotkey: string;

  readonly label: string;
}

/**
 * A control paired with the button that runs it, so refreshing state needs no lookup.
 */
interface RenderedControl {
  readonly buttonEl: HTMLButtonElement;
  readonly control: PickerControl;
}

export class LinkPickerModal extends SuggestModal<Item> {
  private readonly emptyItem: Item;
  private folderPath: string;
  private includeSubfolders: boolean;
  private isClosed = false;
  private isSelected = false;
  private items: Item[] = [];
  private keymapEventHandlers: KeymapEventHandler[] = [];
  private readonly lastOpenFileIndexMap = new Map<string, number>();
  private readonly options: SelectParams;
  private readonly reject: (this: void, reason: unknown) => void;
  private readonly renderedControls: RenderedControl[] = [];
  private readonly resolve: (this: void, value: string) => void;
  private shouldIncludeAllFiles = false;
  private shouldShowOnlyFolders = false;
  private shouldSortByUpdatedDate = true;

  public constructor(params: LinkPickerModalConstructorParams) {
    super(params.options.app);
    this.options = params.options;
    this.resolve = params.resolve;
    this.reject = params.reject;

    this.folderPath = normalizeFolderPath(this.options.folderPath);
    this.includeSubfolders = this.options.includeSubfolders;
    this.emptyItem = createEmptyItem(this.app.vault.getRoot());

    addPluginCssClasses(this.containerEl, 'link-picker-modal');
    this.setPlaceholder(this.options.inlineField || this.options.placeholder || 'Select note file to link');

    this.renderControls();
  }

  public getSuggestions(query: string): Item[] {
    return sortItems(this.items, query, {
      folderNoteRelativePath: this.getCurrentFolderNoteRelativePath(),
      lastOpenFileIndexMap: this.lastOpenFileIndexMap,
      shouldSortByUpdatedDate: this.shouldSortByUpdatedDate
    });
  }

  public onChooseSuggestion(item: Item): void {
    this.resolve(this.formatResult(item));
  }

  public override onClose(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    for (const keymapEventHandler of this.keymapEventHandlers) {
      this.scope.unregister(keymapEventHandler);
    }

    if (!this.isSelected) {
      this.reject(new Error('No link selected'));
    }
  }

  public override onOpen(): void {
    this.inputEl.value = this.options.initialQuery;

    const lastOpenFiles = this.app.workspace.recentFileTracker.lastOpenFiles.slice(0, RECENT_FILE_PATHS_MAX_COUNT);
    for (const [index, lastOpenFile] of lastOpenFiles.entries()) {
      if (!this.lastOpenFileIndexMap.has(lastOpenFile)) {
        this.lastOpenFileIndexMap.set(lastOpenFile, index);
      }
    }

    this.update();

    this.keymapEventHandlers = [
      this.scope.register(['Alt'], '1', this.chooseEmpty.bind(this)),
      this.scope.register(['Alt'], '2', this.toggleIncludeAllFiles.bind(this)),
      this.scope.register(['Alt'], '3', this.toggleIncludeSubfolders.bind(this)),
      this.scope.register(['Alt'], '4', this.toggleShowOnlyFolders.bind(this)),
      this.scope.register(['Alt'], '5', this.toggleSortByUpdatedDate.bind(this)),
      this.scope.register(['Shift'], 'Enter', this.createNew.bind(this))
    ];
  }

  public renderSuggestion(item: Item, el: HTMLElement): void {
    el.empty();
    const fragment = createFragment();
    if (item.isFolder) {
      fragment.append(getIcon('lucide-folder') ?? '', document.createTextNode(' '));
    }
    fragment.append(document.createTextNode(item.relativePath));

    for (const alias of item.aliases) {
      if (!alias) {
        continue;
      }
      const aliasEl = createDiv();
      aliasEl.append(getIcon('lucide-forward') ?? '', document.createTextNode(` ${alias}`));
      fragment.append(aliasEl);
    }

    el.append(fragment);
  }

  public override selectSuggestion(value: Item, event_: KeyboardEvent | MouseEvent): void {
    // Choosing a folder navigates into it rather than picking it — the only way to reach a nested note
    // Without typing its whole path. Handled HERE rather than in `onChooseSuggestion`, because the base
    // Class closes the modal around that callback: on mobile the close lands after anything the callback
    // Does, so reopening from there — inline or on the next tick — simply dismissed the picker. Never
    // Closing it in the first place is both simpler and free of the ordering question.
    //
    // The empty row is excluded by identity, not by type. It is backed by the vault ROOT, which IS a
    // Folder, so a plain `isFolder` test would send `Alt + 1` navigating to the root instead of
    // Declining the link.
    if (value !== this.emptyItem && isFolder(value.file)) {
      this.navigateTo(value.file.path);
      return;
    }

    this.isSelected = true;
    super.selectSuggestion(value, event_);
  }

  /**
   * Declares the six controls, in the order they appear: the two actions, then the four toggles.
   *
   * The labels name the SETTING rather than what pressing would do next — `Include subfolders` reads
   * correctly on a control whose pressed state says whether it is on, where the instruction bar this
   * replaced had to say `Exclude subfolders` once it was.
   *
   * @returns The controls.
   */
  private buildControls(): PickerControl[] {
    return [
      {
        activate: (event_: MouseEvent): void => {
          this.chooseEmpty(event_);
        },
        checkIsAvailable: (): boolean => !this.shouldShowOnlyFolders,
        hotkey: 'Alt + 1',
        label: 'No link'
      },
      {
        activate: (event_: MouseEvent): void => {
          this.createNew(event_);
        },
        checkIsAvailable: (): boolean => !this.shouldShowOnlyFolders && this.options.shouldAllowCreate,
        hotkey: 'Shift + Enter',
        label: 'Create new'
      },
      {
        activate: (): void => {
          this.toggleIncludeAllFiles();
        },
        checkIsAvailable: (): boolean => !this.shouldShowOnlyFolders,
        checkIsOn: (): boolean => this.shouldIncludeAllFiles,
        hotkey: 'Alt + 2',
        label: 'All files'
      },
      {
        activate: (): void => {
          this.toggleIncludeSubfolders();
        },
        checkIsAvailable: (): boolean => !this.shouldShowOnlyFolders,
        checkIsOn: (): boolean => this.includeSubfolders,
        hotkey: 'Alt + 3',
        label: 'Subfolders'
      },
      {
        activate: (): void => {
          this.toggleShowOnlyFolders();
        },
        checkIsAvailable: (): boolean => true,
        checkIsOn: (): boolean => this.shouldShowOnlyFolders,
        hotkey: 'Alt + 4',
        label: 'Folders only'
      },
      {
        activate: (): void => {
          this.toggleSortByUpdatedDate();
        },
        checkIsAvailable: (): boolean => true,
        checkIsOn: (): boolean => this.shouldSortByUpdatedDate,
        hotkey: 'Alt + 5',
        label: 'By date'
      }
    ];
  }

  private buildItems(): Item[] {
    const files = this.filterFiles();

    const items = files.flatMap((file) => this.buildItemsForFile(file));

    if (this.folderPath) {
      // Only the vault root has no parent, and the root's path is empty — so inside this branch the
      // Parent always exists, and asserting it says so without leaving a branch that can never be taken.
      const parent = ensureNonNullable(getFolder({ app: this.app, pathOrFolder: this.folderPath }).parent, 'A non-root folder always has a parent');
      items.unshift({
        ...createEmptyItem(parent),
        relativePath: PARENT_RELATIVE_PATH
      });
    }

    for (const item of items) {
      fillLowerCaseFields(item, this.isFolderNote(item.file));
    }

    return items;
  }

  private buildItemsForFile(file: TAbstractFile): Item[] {
    const folderNote = isFolder(file) ? resolveFolderNote({ app: this.app, config: this.options.folderNoteConfig, folder: file }) : null;
    const cache = folderNote
      ? this.app.metadataCache.getFileCache(folderNote)
      : (isFile(file)
        ? this.app.metadataCache.getFileCache(asFile(file))
        : null);
    const frontmatter: FrontMatterCache | undefined = cache?.frontmatter ?? undefined;
    const updated = this.readUpdated(file, frontmatter);
    const relativePath = this.folderPath ? file.path.slice(this.folderPath.length + 1) : file.path;

    let aliases = parseFrontMatterAliases(frontmatter) ?? [];

    if (isFolder(file)) {
      // A folder aliased with its own name would render as `Foo → Foo`.
      aliases = aliases.filter((alias) => alias !== file.name);
      return [{
        ...createEmptyItem(file),
        aliases,
        relativePath,
        updated
      }];
    }

    // The empty alias is the row for the note's own name. A folder note has no name worth offering — it is reached by its folder — so it gets alias rows only.
    if (!this.isFolderNote(file)) {
      aliases.push('');
    }

    return aliases.map((alias) => ({
      ...createEmptyItem(file),
      aliases: alias ? [alias] : [],
      isFolder: false,
      relativePath,
      updated
    }));
  }

  private chooseEmpty(event_: KeyboardEvent | MouseEvent): MaybeReturn<boolean> {
    if (this.shouldShowOnlyFolders) {
      return;
    }

    this.selectSuggestion(this.emptyItem, event_);

    // Explicitly consumed, unlike the other hotkeys: this one CLOSES the picker, so without saying so the
    // Keypress carries on to whatever gains focus next and types the digit into the note being edited.
    return false;
  }

  private createNew(event_: KeyboardEvent | MouseEvent): boolean {
    // `true` hands the key back to Obsidian, which is what an offer the picker is not making should do.
    if (this.shouldShowOnlyFolders || !this.options.shouldAllowCreate) {
      return true;
    }

    invokeAsyncSafely(() => this.createNewAsync(event_));
    return false;
  }

  private async createNewAsync(event_: KeyboardEvent | MouseEvent): Promise<void> {
    const newNoteTitle = this.inputEl.value || (await prompt({
      app: this.app,
      placeholder: this.options.inlineField || this.options.placeholder || '',
      title: 'Create new note'
    }));

    if (newNoteTitle === null) {
      this.reject(new Error('Note title is not provided'));
      return;
    }

    const newFile = await this.options.createNote(this.folderPath, newNoteTitle);
    const alias = await this.readTitle(newFile);

    this.selectSuggestion({
      ...createEmptyItem(newFile),
      aliases: [alias],
      isFolder: false
    }, event_);
  }

  private filterFiles(): TAbstractFile[] {
    const folder = getFolder({ app: this.app, pathOrFolder: this.folderPath === '' ? '/' : this.folderPath });

    let files: TAbstractFile[];

    if (this.includeSubfolders) {
      files = [];
      Vault.recurseChildren(folder, (child) => {
        if (child !== folder) {
          files.push(child);
        }
      });
    } else {
      files = folder.children;
    }

    if (this.shouldShowOnlyFolders) {
      return files.filter(isFolder);
    }

    if (!this.shouldIncludeAllFiles) {
      files = files.filter((file) => !this.isExcluded(file));
      files = files.filter((file) => isFolder(file) || (isFile(file) && file.extension === 'md'));
    }

    return files;
  }

  private formatResult(item: Item): string {
    const link = item === this.emptyItem ? '' : this.generateLink(item);
    return this.options.inlineField ? `${this.options.inlineField}: ${link}` : link;
  }

  /**
   * Builds the link for a picked row.
   *
   * Only ever reached with a FILE row. Choosing a folder navigates into it instead of picking it — see
   * {@link onChooseSuggestion} — so the folder-to-folder-note path the original script carried here could
   * never run, and neither could the folder-name fallback for a row with no alias: a folder note is only
   * ever listed under an alias it actually has, so a row without one is never a folder note.
   */
  private generateLink(item: Item): string {
    return generateMarkdownLink({
      alias: item.aliases[0] ?? '',
      app: this.app,
      sourcePathOrFile: this.options.sourcePathOrFile,
      targetPathOrFile: asFile(item.file)
    });
  }

  private getCurrentFolderNoteRelativePath(): string {
    if (!this.folderPath) {
      return '';
    }

    const folderNote = resolveFolderNote({
      app: this.app,
      config: this.options.folderNoteConfig,
      folder: getFolder({ app: this.app, pathOrFolder: this.folderPath })
    });

    if (!folderNote) {
      return '';
    }

    return folderNote.path.startsWith(`${this.folderPath}/`) ? folderNote.path.slice(this.folderPath.length + 1) : '';
  }

  private isExcluded(file: TAbstractFile): boolean {
    return this.options.excludedPathPatterns.some((pattern) => pattern !== '' && file.path.includes(pattern));
  }

  private isFolderNote(file: TAbstractFile): boolean {
    if (!isFile(file) || !file.parent) {
      return false;
    }

    return resolveFolderNote({ app: this.app, config: this.options.folderNoteConfig, folder: file.parent })?.path === file.path;
  }

  /**
   * Re-roots the picker at a folder, in place.
   *
   * The query is cleared: it was typed to FIND this folder, and inside it it means nothing.
   *
   * @param folderPath - The folder to root at.
   */
  private navigateTo(folderPath: string): void {
    // Normalized because the vault ROOT's path is `/`, and `..` out of a top-level folder lands on it.
    // Left as `/` it is truthy, so the picker would look for a parent the root does not have and would
    // Slice two characters off every row's relative path.
    this.folderPath = normalizeFolderPath(folderPath);
    this.shouldShowOnlyFolders = false;
    this.inputEl.value = '';
    this.update();
  }

  private async readTitle(file: TFile): Promise<string> {
    if (!this.options.titlePropertyName) {
      return file.basename;
    }

    const frontmatter = await getFrontmatterSafe(this.app, file);
    const title: unknown = frontmatter[this.options.titlePropertyName];
    return typeof title === 'string' ? title : file.basename;
  }

  private readUpdated(file: TAbstractFile, frontmatter: FrontMatterCache | undefined): string {
    if (this.options.updatedPropertyName) {
      const updated: unknown = frontmatter?.[this.options.updatedPropertyName];
      if (typeof updated === 'string') {
        return updated;
      }
    }

    // Zero-padded so it still sorts lexicographically alongside the ISO strings a frontmatter property
    // Holds — the comparator does one `localeCompare` and must not care which source a value came from.
    return isFile(file) ? String(file.stat.mtime).padStart(EPOCH_DIGITS, '0') : '';
  }

  /**
   * Brings each control's pressed and disabled state up to date with the picker's.
   *
   * Disabled rather than hidden: a strip that loses buttons as modes change reflows under the pointer,
   * and on a phone that means a mis-tap.
   */
  private refreshControls(): void {
    for (const { buttonEl, control } of this.renderedControls) {
      const isOn = control.checkIsOn?.() ?? false;
      buttonEl.disabled = !control.checkIsAvailable();
      buttonEl.toggleClass('is-active', isOn);
      buttonEl.setAttribute('aria-pressed', String(isOn));
    }
  }

  /**
   * Builds the strip once, at construction.
   *
   * Built once and only re-STATED afterwards, because rebuilding it on every keystroke would replace the
   * element under a pointer that may be about to click it.
   */
  private renderControls(): void {
    const controlsEl = this.modalEl.createDiv();
    addPluginCssClasses(controlsEl, 'link-picker-controls');

    for (const control of this.buildControls()) {
      const buttonEl = controlsEl.createEl('button', { type: 'button' });
      addPluginCssClasses(buttonEl, 'link-picker-control');
      buttonEl.createSpan({ text: control.label });

      // The hotkey is shown only where one can be pressed. On a phone there is no `Alt` to offer, and
      // The control IS the only way in — which is why the strip exists.
      if (!Platform.isMobile) {
        const hotkeyEl = buttonEl.createSpan({ text: control.hotkey });
        addPluginCssClasses(hotkeyEl, 'link-picker-control-hotkey');
      }

      // The input keeps focus: the picker filters as you type, and a click that stole focus would end
      // That mid-search.
      buttonEl.addEventListener('mousedown', (event_) => {
        event_.preventDefault();
      });

      buttonEl.addEventListener('click', (event_) => {
        control.activate(event_);
      });

      this.renderedControls.push({ buttonEl, control });
    }

    this.refreshControls();
  }

  private toggleIncludeAllFiles(): MaybeReturn<boolean> {
    if (this.shouldShowOnlyFolders) {
      return;
    }

    this.shouldIncludeAllFiles = !this.shouldIncludeAllFiles;
    this.update();
    return false;
  }

  private toggleIncludeSubfolders(): MaybeReturn<boolean> {
    if (this.shouldShowOnlyFolders) {
      return;
    }

    this.includeSubfolders = !this.includeSubfolders;
    this.update();
    return false;
  }

  private toggleShowOnlyFolders(): boolean {
    this.shouldShowOnlyFolders = !this.shouldShowOnlyFolders;
    this.update();
    return false;
  }

  private toggleSortByUpdatedDate(): boolean {
    this.shouldSortByUpdatedDate = !this.shouldSortByUpdatedDate;
    this.update();
    return false;
  }

  private update(): void {
    this.refreshControls();
    this.items = this.buildItems();

    // Re-runs `getSuggestions` against the unchanged query, which is how a toggle repaints the list.
    this.inputEl.dispatchEvent(new InputEvent('input'));
  }
}

/**
 * Wide enough for any millisecond epoch this side of the year 5138, so padded values keep sorting
 * correctly for as long as the format itself does.
 */
const EPOCH_DIGITS = 13;

function createEmptyItem(file: TAbstractFile): Item {
  return {
    aliases: [],
    file,
    isFolder: true,
    lowerCaseExtension: '',
    lowerCasePathParts: [],
    lowerCaseRelativePath: '',
    lowerCaseTitles: [],
    relativePath: '',
    updated: ''
  };
}

function normalizeFolderPath(folderPath: string): string {
  return folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

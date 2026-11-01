import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type { FolderNoteConfig } from '@mnaoumov/obsidian-lib/folder-note';
import type { DisposableEx } from '@mnaoumov/typescript-lib/disposable';
import type {
  App,
  TFolder
} from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { getFileOrNull } from '@mnaoumov/obsidian-lib/file-system';
import {
  FolderNoteLocation,
  resolveFolderNoteConfig
} from '@mnaoumov/obsidian-lib/folder-note';
import { CallbackDisposable } from '@mnaoumov/typescript-lib/disposable';
import { join } from '@mnaoumov/typescript-lib/path';
import {
  Notice,
  TFile
} from 'obsidian';

import type { LinkPickerApiCreateNote } from '../../api.d.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type {
  SelectOptions,
  SelectParams
} from './select.ts';

import { SegmentMatchMode } from './item.ts';
import { select } from './select.ts';

/**
 * What {@link LinkPickerComponent.select} accepts — the plugin's public picker options, plus the one
 * option only the plugin's own commands pass.
 */
export interface LinkPickerComponentSelectParams extends SelectOptions {
  /**
   * The display text of the picked link, in place of the row's alias. Empty or absent keeps the alias.
   *
   * Not part of the published options: an API caller already holds the text it would pass and the link
   * string the call returns.
   */
  readonly linkDisplayText?: string;

  /**
   * The note creator a configured picker names. Empty or absent falls back to
   * {@link PluginSettings.noteCreatorName}.
   *
   * Not part of the published options: an API caller holds the function itself and passes
   * {@link SelectOptions.createNote}.
   */
  readonly noteCreatorName?: string;
}

interface LinkPickerComponentConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
}

type LinkPickerComponentResolveOptionsParams = LinkPickerComponentSelectParams;

/**
 * One registration of a note creator.
 *
 * An object rather than the bare function, so a disposal can tell its own registration from a newer one
 * under the same name even when both registered the very same function.
 */
interface NoteCreatorEntry {
  readonly createNote: LinkPickerApiCreateNote;
}

/**
 * The folder-note locations that can still be seen once `Auto` has been resolved away.
 */
type ResolvedFolderNoteLocation = FolderNoteConfig['location'];

/**
 * Maps a published folder-note location onto the `@mnaoumov/obsidian-lib` enum member that spells it.
 *
 * `api.d.ts` may not import `@mnaoumov/obsidian-lib`, so it inlines the location as a plain string union — and
 * a string enum is NOMINAL in TypeScript, so the two are not assignable however identical their runtime
 * values are. A table rather than a cast because the key type is derived FROM the enum (a template literal
 * expands a string enum to its literal values), so a member added, renamed or removed upstream fails to
 * compile HERE, which is the only compile-time tether the published file's inlined copies have: nothing
 * checks them otherwise, `skipLibCheck` meaning a root declaration is never checked from the inside.
 */
const FOLDER_NOTE_LOCATIONS: Record<`${ResolvedFolderNoteLocation}`, ResolvedFolderNoteLocation> = {
  InsideFolder: FolderNoteLocation.InsideFolder,
  None: FolderNoteLocation.None,
  ParentFolder: FolderNoteLocation.ParentFolder
};

/**
 * Maps a published segment-match mode onto its {@link SegmentMatchMode} member, for the reason
 * {@link FOLDER_NOTE_LOCATIONS} gives.
 */
const SEGMENT_MATCH_MODES: Record<`${SegmentMatchMode}`, SegmentMatchMode> = {
  Fuzzy: SegmentMatchMode.Fuzzy,
  Substring: SegmentMatchMode.Substring
};

/**
 * Owns the picker: turns a caller's partial {@link SelectOptions} into the fully resolved options the
 * modal needs, filling every gap from the plugin's settings.
 */
export class LinkPickerComponent extends ComponentEx {
  private readonly app: App;
  private readonly noteCreators = new Map<string, NoteCreatorEntry>();
  private readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;

  public constructor(params: LinkPickerComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  /**
   * Registers how a missing note is created, under a name the settings can refer to.
   *
   * A second registration under a live name REPLACES the first rather than failing: a vault startup script
   * that re-runs without having run its cleanup must not break the plugin's commands, and the newest
   * registration is the one its author means.
   *
   * @param name - The note creator's name. Must not be blank.
   * @param createNote - Creates the note.
   * @returns A disposable removing this registration — and only this one, so disposing a superseded
   * registration leaves its replacement in place.
   */
  public registerNoteCreator(name: string, createNote: LinkPickerApiCreateNote): DisposableEx {
    if (!name.trim()) {
      throw new Error('A note creator needs a name: it is what a picker\'s setting refers to.');
    }

    const entry: NoteCreatorEntry = { createNote };
    this.noteCreators.set(name, entry);

    return new CallbackDisposable({
      callback: (): void => {
        if (this.noteCreators.get(name) === entry) {
          this.noteCreators.delete(name);
        }
      }
    });
  }

  /**
   * Opens the picker and resolves with the chosen link text.
   *
   * @param options - Per-call options; anything omitted comes from the plugin's settings.
   * @returns The link text. Rejects when the user dismisses the picker without choosing.
   */
  public async select(params: LinkPickerComponentSelectParams): Promise<string> {
    return await select(this.resolveOptions(params));
  }

  /**
   * Creates an EMPTY note, and only when one does not already exist.
   *
   * Deliberately minimal: templates, frontmatter and naming conventions are vault policy, and a caller
   * that has any supplies {@link SelectOptions.createNote} instead of settling for this.
   */
  private async createNote(folderPath: string, newNoteTitle: string): Promise<TFile> {
    const notePath = join(folderPath, `${newNoteTitle}.md`);
    const existingFile = getFileOrNull({ app: this.app, pathOrFile: notePath });

    if (existingFile) {
      return existingFile;
    }

    if (folderPath && !(await this.app.vault.exists(folderPath))) {
      await this.app.vault.createFolder(folderPath);
    }

    return await this.app.vault.create(notePath, '');
  }

  /**
   * Picks the function that creates a missing note when the caller passed none.
   *
   * The note creator is looked up when the note is CREATED, not when the picker opens, so one a startup
   * script registers after the command was bound still serves it.
   *
   * @param noteCreatorName - The note creator the picker or the settings name; empty means the built-in.
   * @returns The function.
   */
  private resolveCreateNote(noteCreatorName: string): LinkPickerApiCreateNote {
    if (!noteCreatorName) {
      return async (folderPath: string, newNoteTitle: string): Promise<TFile> => await this.createNote(folderPath, newNoteTitle);
    }

    return async (folderPath: string, newNoteTitle: string): Promise<TFile> => {
      const entry = this.noteCreators.get(noteCreatorName);

      // Refused rather than handed to the built-in: an empty note under the raw name is exactly what the named note creator exists to prevent, and a startup script that has not registered yet would otherwise produce one silently.
      if (!entry) {
        const message = `The note creator "${noteCreatorName}" is not registered. A script registers it through the Link Picker API.`;
        new Notice(message);
        throw new Error(message);
      }

      return await entry.createNote(folderPath, newNoteTitle);
    };
  }

  private resolveFolderNoteConfig(): ReturnType<typeof resolveFolderNoteConfig> {
    const settings = this.pluginSettingsComponent.settings;

    if (settings.folderNoteLocation === FolderNoteLocation.Auto) {
      return resolveFolderNoteConfig({ app: this.app });
    }

    return resolveFolderNoteConfig({
      app: this.app,
      location: settings.folderNoteLocation,
      resolveName: settings.folderNoteName ? (): string => settings.folderNoteName : (folder: TFolder): string => folder.name
    });
  }

  private resolveOptions(params: LinkPickerComponentResolveOptionsParams): SelectParams {
    const settings = this.pluginSettingsComponent.settings;

    return {
      app: this.app,
      createNote: params.createNote ?? this.resolveCreateNote(resolveNoteCreatorName(params.noteCreatorName, settings.noteCreatorName)),
      excludedPathPatterns: params.excludedPathPatterns ?? settings.excludedPathPatterns,
      folderNoteConfig: params.folderNoteConfig ? toFolderNoteConfig(params.folderNoteConfig) : this.resolveFolderNoteConfig(),
      folderPath: params.folderPath ?? '',
      includeSubfolders: params.includeSubfolders ?? false,
      initialQuery: params.initialQuery ?? '',
      linkDisplayText: params.linkDisplayText ?? '',
      placeholder: params.placeholder ?? '',
      prefix: params.prefix ?? '',
      segmentMatchMode: params.segmentMatchMode ? SEGMENT_MATCH_MODES[params.segmentMatchMode] : settings.segmentMatchMode,
      shouldAllowCreate: params.shouldAllowCreate ?? true,
      shouldApplyPrefixSuffixWhenNoLinkSelected: params.shouldApplyPrefixSuffixWhenNoLinkSelected ?? false,

      // An empty string is a legitimate source path (the vault root), so the active file is only consulted when the caller said nothing at all.
      sourcePathOrFile: params.sourcePathOrFile ?? this.app.workspace.getActiveFile() ?? '',

      suffix: params.suffix ?? '',
      titlePropertyName: params.titlePropertyName ?? settings.titlePropertyName,
      updatedPropertyName: params.updatedPropertyName ?? settings.updatedPropertyName
    };
  }
}

/**
 * Picks the note creator a call goes through.
 *
 * An EMPTY picker name falls back as well as an absent one: it is what a picker whose `Note creator` row
 * was left blank stores, and it means "whatever the top-level setting says".
 *
 * @param pickerNoteCreatorName - What the configured picker names, if anything.
 * @param settingsNoteCreatorName - What the top-level setting names.
 * @returns The name to look up; empty means the built-in.
 */
function resolveNoteCreatorName(pickerNoteCreatorName: string | undefined, settingsNoteCreatorName: string): string {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- An empty name must fall back too, which `??` would not do.
  return pickerNoteCreatorName || settingsNoteCreatorName;
}

/**
 * Restates a caller's published folder-note setup in the vocabulary the picker reads.
 *
 * @param folderNoteConfig - The setup as the published API accepts it.
 * @returns The same setup, with its location spelled as the `@mnaoumov/obsidian-lib` enum member.
 */
function toFolderNoteConfig(folderNoteConfig: NonNullable<SelectOptions['folderNoteConfig']>): FolderNoteConfig {
  // The location is taken out before the spread, so the published string union never lands on the enum-typed field, even for a moment.
  const { location, ...rest } = folderNoteConfig;
  return {
    ...rest,
    location: FOLDER_NOTE_LOCATIONS[location]
  };
}

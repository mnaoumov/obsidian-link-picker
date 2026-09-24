import type {
  App,
  TFolder
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { FolderNoteConfig } from 'obsidian-dev-utils/obsidian/folder-note';

import { TFile } from 'obsidian';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { getFileOrNull } from 'obsidian-dev-utils/obsidian/file-system';
import {
  FolderNoteLocation,
  resolveFolderNoteConfig
} from 'obsidian-dev-utils/obsidian/folder-note';
import { join } from 'obsidian-dev-utils/path';

import type { PluginSettings } from './plugin-settings.ts';
import type {
  SelectOptions,
  SelectParams
} from './select.ts';

import { SegmentMatchMode } from './item.ts';
import { select } from './select.ts';

/**
 * What {@link LinkPickerComponent.select} accepts — the plugin's public picker options.
 */
export type LinkPickerComponentSelectParams = SelectOptions;

interface LinkPickerComponentConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
}

type LinkPickerComponentResolveOptionsParams = SelectOptions;

/**
 * The folder-note locations that can still be seen once `Auto` has been resolved away.
 */
type ResolvedFolderNoteLocation = FolderNoteConfig['location'];

/**
 * Maps a published folder-note location onto the `obsidian-dev-utils` enum member that spells it.
 *
 * `api.d.ts` may not import `obsidian-dev-utils`, so it inlines the location as a plain string union — and
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
  private readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;

  public constructor(params: LinkPickerComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
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
      createNote: params.createNote ?? (async (folderPath: string, newNoteTitle: string): Promise<TFile> => await this.createNote(folderPath, newNoteTitle)),
      excludedPathPatterns: params.excludedPathPatterns ?? settings.excludedPathPatterns,
      folderNoteConfig: params.folderNoteConfig ? toFolderNoteConfig(params.folderNoteConfig) : this.resolveFolderNoteConfig(),
      folderPath: params.folderPath ?? '',
      includeSubfolders: params.includeSubfolders ?? false,
      initialQuery: params.initialQuery ?? '',
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
 * Restates a caller's published folder-note setup in the vocabulary the picker reads.
 *
 * @param folderNoteConfig - The setup as the published API accepts it.
 * @returns The same setup, with its location spelled as the `obsidian-dev-utils` enum member.
 */
function toFolderNoteConfig(folderNoteConfig: NonNullable<SelectOptions['folderNoteConfig']>): FolderNoteConfig {
  return {
    ...folderNoteConfig,
    location: FOLDER_NOTE_LOCATIONS[folderNoteConfig.location]
  };
}

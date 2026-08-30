import type {
  App,
  TFolder
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

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
      folderNoteConfig: params.folderNoteConfig ?? this.resolveFolderNoteConfig(),
      folderPath: params.folderPath ?? '',
      includeSubfolders: params.includeSubfolders ?? false,
      initialQuery: params.initialQuery ?? '',
      placeholder: params.placeholder ?? '',
      prefix: params.prefix ?? '',
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

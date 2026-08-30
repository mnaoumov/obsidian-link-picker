import type {
  App,
  TFile
} from 'obsidian';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/file-system';
import type { FolderNoteConfig } from 'obsidian-dev-utils/obsidian/folder-note';

import { LinkPickerModal } from './link-picker-modal.ts';

/**
 * What a caller passes to {@link select}.
 *
 * Everything except {@link SelectOptions.app} is optional: the plugin's settings supply the defaults, and
 * anything given here overrides them for this one call.
 */
export interface SelectOptions {
  readonly app: App;

  /**
   * Creates the note when the user picks "create new".
   *
   * The hook exists because note creation is where vault conventions live — validating the name, deriving
   * a subfolder from it, seeding frontmatter, applying a template. None of that is expressible in
   * settings, so a caller with such conventions supplies them here and the plugin stays out of the way.
   *
   * @param folderPath - The folder the picker is currently rooted at.
   * @param newNoteTitle - What the user typed.
   * @returns The created note.
   */
  createNote?(this: void, folderPath: string, newNoteTitle: string): Promise<TFile>;

  /**
   * Paths matching any of these are hidden. Overrides the setting.
   */
  readonly excludedPathPatterns?: readonly string[];

  /**
   * A resolved folder-note setup. Overrides the setting, and is worth passing when the same setup is used
   * across many calls, since resolving it reads another plugin's configuration.
   */
  readonly folderNoteConfig?: FolderNoteConfig;

  /**
   * The folder the picker opens rooted at. Empty means the vault root.
   */
  readonly folderPath?: string;

  /**
   * Whether the picker starts with subfolder contents included.
   */
  readonly includeSubfolders?: boolean;

  /**
   * Seeds the input, so a picker opened over a selection starts filtered by it.
   */
  readonly initialQuery?: string;

  /**
   * Emitted before the link, as `<inlineField>: <link>`, and used as the placeholder when none is given.
   */
  readonly inlineField?: string;

  /**
   * The modal's placeholder text.
   */
  readonly placeholder?: string;

  /**
   * Whether "create new" is offered.
   */
  readonly shouldAllowCreate?: boolean;

  /**
   * The note the generated link is written INTO, which decides whether it comes out relative or absolute.
   * Defaults to the active file.
   */
  readonly sourcePathOrFile?: PathOrFile;

  /**
   * Frontmatter property holding a note's display title. Overrides the setting.
   */
  readonly titlePropertyName?: string;

  /**
   * Frontmatter property holding a note's last-updated stamp. Overrides the setting.
   */
  readonly updatedPropertyName?: string;
}

/**
 * {@link SelectOptions} with every default already applied — what the modal actually reads.
 */
export interface SelectParams {
  readonly app: App;
  createNote(this: void, folderPath: string, newNoteTitle: string): Promise<TFile>;
  readonly excludedPathPatterns: readonly string[];
  readonly folderNoteConfig: FolderNoteConfig;
  readonly folderPath: string;
  readonly includeSubfolders: boolean;
  readonly initialQuery: string;
  readonly inlineField: string;
  readonly placeholder: string;
  readonly shouldAllowCreate: boolean;
  readonly sourcePathOrFile: PathOrFile;
  readonly titlePropertyName: string;
  readonly updatedPropertyName: string;
}

/**
 * Opens the picker and resolves with the chosen link.
 *
 * The result is a STRING rather than a file, because the picker's oldest and most common caller is a
 * template writing a property value: `<inlineField>: <link>`, or the bare link, or the empty string when
 * the user deliberately chose nothing.
 *
 * @param options - The fully resolved options.
 * @returns The link text. Rejects when the user dismisses the picker without choosing.
 */
export async function select(options: SelectParams): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    new LinkPickerModal({ options, reject, resolve }).open();
  });
}

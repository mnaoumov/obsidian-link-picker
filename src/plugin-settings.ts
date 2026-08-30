import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';

/**
 * A named, preconfigured picker.
 *
 * Each one becomes its own command, so a vault that picks people out of `People` and courts out of
 * `Legal/Суд` gets two commands rather than one command that asks which folder first.
 *
 * Anything richer than these fields — validating a name, routing a new note to a folder derived from it,
 * seeding frontmatter — is not expressible here and is not meant to be. That is what
 * {@link SelectOptions.createNote} is for, reached through the plugin's API.
 */
export class Picker {
  /**
   * The folder the picker opens rooted at. Empty means the vault root.
   *
   * This is a starting point, not a fence — the picker can still be navigated out of it, which is why
   * there is no separate "allow escaping" setting.
   */
  public folderPath = '';

  /**
   * Whether the picker starts with subfolder contents included. Can be toggled while it is open.
   */
  public includeSubfolders = false;

  /**
   * Emitted before the picked link, as `<inlineField>: <link>`. Empty means the link alone.
   *
   * Named for Dataview's inline-field syntax, which is what the shape is for: the picker's result drops
   * straight into a note's property list.
   */
  public inlineField = '';

  /**
   * The command name, and the picker's identity in settings.
   */
  public name = '';

  /**
   * The modal's placeholder text. Empty falls back to {@link inlineField}, then to a generic prompt.
   */
  public placeholder = '';

  /**
   * Whether the picker offers to create a note that does not exist yet.
   */
  public shouldAllowCreate = true;
}

export class PluginSettings {
  /**
   * Paths matching any of these are hidden from the picker.
   *
   * Substring matches, not globs: the case this exists for is a vault-wide attachment folder convention
   * (`/!!files`), and a substring says that in one line without a pattern language to learn.
   */
  public excludedPathPatterns: readonly string[] = [];

  /**
   * How a folder's folder note is located.
   *
   * {@link FolderNoteLocation.Auto} — the default — reads the installed `folder-notes` plugin's live
   * configuration, so a vault that already has folder notes needs no setting here at all.
   */
  public folderNoteLocation: FolderNoteLocation = FolderNoteLocation.Auto;

  /**
   * The folder note's name, without extension, when {@link folderNoteLocation} is not
   * {@link FolderNoteLocation.Auto}. Empty means the folder's own name.
   */
  public folderNoteName = '';

  /**
   * The configured pickers. Each becomes a command.
   */
  public pickers: readonly Picker[] = [];

  /**
   * Frontmatter property holding a note's display title, used as the alias of a note the picker creates.
   * Empty falls back to the file's basename.
   */
  public titlePropertyName = '';

  /**
   * Frontmatter property holding a note's last-updated timestamp, used by the sort-by-updated ordering.
   * Empty falls back to the file's modification time, which every vault has.
   */
  public updatedPropertyName = '';
}

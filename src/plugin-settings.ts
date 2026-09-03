import { FolderNoteLocation } from 'obsidian-dev-utils/obsidian/folder-note';

import { SegmentMatchMode } from './item.ts';

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
   * The picker's stable identity, minted by {@link createPicker} when it is added.
   *
   * The command id is derived from this rather than from {@link name}, so renaming a picker keeps
   * whatever hotkey the user bound to it.
   */
  public id = '';

  /**
   * Whether the picker starts with subfolder contents included. Can be toggled while it is open.
   */
  public includeSubfolders = false;

  /**
   * The command name, and the picker's identity in settings.
   */
  public name = '';

  /**
   * The modal's placeholder text. Empty falls back to a generic prompt.
   */
  public placeholder = '';

  /**
   * Emitted immediately before the picked link. Empty means the link alone.
   *
   * A plain string rather than a field name, so `Person: ` covers Dataview's inline-field shape without
   * the plugin having to know what one is, and `- ` or `"` work just as well.
   */
  public prefix = '';

  /**
   * Whether the picker offers to create a note that does not exist yet.
   */
  public shouldAllowCreate = true;

  /**
   * Whether {@link prefix} and {@link suffix} are still emitted when the user declines a link.
   *
   * Off by default: declining then returns the empty string rather than a `Person: ` with nothing after
   * it, and a dangling property key is worse than an absent one.
   */
  public shouldApplyPrefixSuffixWhenNoLinkSelected = false;

  /**
   * Emitted immediately after the picked link. Empty means the link alone.
   */
  public suffix = '';
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
   * How one term of the query is tested against one part of a path.
   *
   * {@link SegmentMatchMode.Substring} — the default — is the rule the picker has always used, and the
   * one that makes the same query put the same note first today and next month.
   */
  public segmentMatchMode: SegmentMatchMode = SegmentMatchMode.Substring;

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

/**
 * Builds a picker with a fresh {@link Picker.id}.
 *
 * The only supported way to add one: a picker whose id is blank, or which shares an id with another,
 * fails validation and the whole list falls back to empty rather than registering commands that
 * collide.
 *
 * @returns The new picker.
 */
export function createPicker(): Picker {
  const picker = new Picker();
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- crypto.randomUUID is a stable Web API in the Obsidian (Electron) runtime.
  picker.id = crypto.randomUUID();
  return picker;
}

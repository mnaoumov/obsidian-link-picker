/**
 * The API this plugin publishes for other plugins and scripts to call.
 *
 * Copy this file into your own plugin: it imports from `obsidian` and nothing else, so it costs you no
 * dependency on this one and none on `obsidian-dev-utils`. That is why {@link PathOrFile},
 * {@link FolderNoteConfig} and {@link FolderNoteLocation} — which the plugin itself takes from that
 * library — and {@link SegmentMatchMode}, which is its own, are all inlined below as plain structural
 * types rather than imported. They carry the same runtime values the plugin uses.
 *
 * The API is reached through the cross-plugin API registry, keyed by the plugin id and version-negotiated
 * against {@link LinkPickerApi}'s CONTRACT version, which moves independently of the plugin's own
 * `manifest.version`. The README's `For plugin developers` section shows both routes: `watchPluginApi` for
 * a consumer that already has `obsidian-dev-utils`, and the library-free registry read for one that does
 * not.
 */

import type {
  TFile,
  TFolder
} from 'obsidian';

/**
 * A path, or the file itself.
 */
export type PathOrFile = string | TFile;

/**
 * Where a folder note sits relative to its folder.
 *
 * These three are the RESOLVED answers, so there is deliberately no `Auto` among them: whatever reads the
 * installed `folder-notes` plugin's configuration has already run by the time a config carrying this
 * exists, and a caller passing one has decided the question itself.
 */
export type FolderNoteLocation = 'InsideFolder' | 'None' | 'ParentFolder';

/**
 * How one term of the query is tested against one part of a path.
 *
 * `Fuzzy` finds more, it never reorders — a scattered hit can only ever rank below a contiguous one.
 */
export type SegmentMatchMode = 'Fuzzy' | 'Substring';

/**
 * A folder-note setup with {@link FolderNoteLocation} already resolved to a concrete answer.
 */
export interface FolderNoteConfig {
  /**
   * The extensions a folder note may carry, WITHOUT the leading dot, in resolution order — the first one
   * that names an existing file wins.
   */
  readonly extensions: readonly string[];

  /**
   * Whether the folder note is hidden in the file explorer.
   */
  readonly isHidden: boolean;

  /**
   * Where the note sits relative to its folder.
   */
  readonly location: FolderNoteLocation;

  /**
   * Names the folder note of a folder, WITHOUT its extension.
   *
   * @param folder - The folder whose note is being named.
   * @returns The note's name; an empty (or blank) name means the folder has no folder note.
   */
  resolveName: (folder: TFolder) => string;
}

/**
 * What {@link LinkPickerApi.select} accepts.
 *
 * Every member is optional: the plugin's settings supply the defaults, and anything given here overrides
 * them for this one call.
 *
 * There is deliberately no `app` here. A consumer reaching across the plugin boundary must not have to
 * hand the provider back the very `App` the provider already holds.
 */
export interface LinkPickerApiSelectParams {
  /**
   * Creates the note when the user picks `Create new`.
   *
   * This is the hook the whole API exists for: note creation is where vault conventions live — validating
   * the name, deriving a subfolder from it, seeding frontmatter, applying a template — and none of that is
   * expressible in settings. Without it the plugin creates an empty note.
   *
   * @param folderPath - The folder the picker is currently rooted at.
   * @param newNoteTitle - What the user typed.
   * @returns The created note.
   */
  readonly createNote?: (this: void, folderPath: string, newNoteTitle: string) => Promise<TFile>;

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
   *
   * A starting point, not a fence — the user can still navigate out of it.
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
   * The modal's placeholder text.
   */
  readonly placeholder?: string;

  /**
   * Emitted immediately before the link.
   *
   * A property list wants `Person: `, so that is what this is for — but it is a plain string rather than a
   * field name, so a caller that wants `- ` or `"` gets those too.
   */
  readonly prefix?: string;

  /**
   * How one term of the query is tested against one part of a path. Overrides the setting.
   */
  readonly segmentMatchMode?: SegmentMatchMode;

  /**
   * Whether `Create new` is offered.
   */
  readonly shouldAllowCreate?: boolean;

  /**
   * Whether {@link prefix} and {@link suffix} are still emitted when the user declines a link.
   *
   * Off by default, which makes declining return the empty string rather than a `Person: ` with nothing
   * after it — a dangling property key is worse than an absent one. Turn it on where the surrounding
   * document needs the key present regardless.
   */
  readonly shouldApplyPrefixSuffixWhenNoLinkSelected?: boolean;

  /**
   * The note the generated link is written INTO, which decides whether it comes out relative or absolute.
   * Defaults to the active file.
   *
   * Worth passing explicitly when the note being written to is not the one Obsidian considers active —
   * which is the case while a template renders a brand-new note.
   */
  readonly sourcePathOrFile?: PathOrFile;

  /**
   * Emitted immediately after the link.
   */
  readonly suffix?: string;

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
 * What the registry hands a consumer.
 *
 * @remarks
 * The whole of the surface. The plugin's own `LinkPickerApi` class implements this rather than restating
 * it, so a member that appears here and nowhere in the plugin — or the reverse — fails the plugin's build.
 */
export interface LinkPickerApi {
  /**
   * Opens the picker and resolves with the chosen link text.
   *
   * @param params - Per-call options; anything omitted comes from the plugin's settings.
   * @returns The link text. REJECTS when the user dismisses the picker without choosing, which is
   * different from the empty string a deliberate `No link` returns.
   */
  select(params: LinkPickerApiSelectParams): Promise<string>;
}

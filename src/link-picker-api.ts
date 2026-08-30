import type { PathOrFile } from 'obsidian-dev-utils/obsidian/file-system';
import type { FolderNoteConfig } from 'obsidian-dev-utils/obsidian/folder-note';
import type { PluginApiContract } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';

import { TFile } from 'obsidian';
import { z } from 'zod';

import type { LinkPickerComponent } from './link-picker-component.ts';
import type { SelectOptions } from './select.ts';

/**
 * The version of the API {@link LINK_PICKER_API_CONTRACT} describes.
 *
 * This is the CONTRACT version, and it is independent of the plugin's own `manifest.version` — the plugin
 * may reach `2.0.0` while still exposing this API unchanged, and this may reach `2.0.0` while the plugin
 * does not. Consumers pin a range against this one, not against the plugin.
 */
export const LINK_PICKER_API_VERSION = '1.0.0';

/**
 * What {@link LinkPickerApi.select} accepts — the plugin's public picker options.
 */
export type LinkPickerApiSelectParams = SelectOptions;

/**
 * Validates a callback, which no schema can look inside.
 *
 * A cross-plugin call carries the function itself across the boundary, so all that can be said about it
 * is that it is callable — and that is still worth saying, because passing a non-function here fails deep
 * inside the picker rather than at the call that made the mistake.
 */
const noteCreatorSchema = z.custom<NonNullable<SelectOptions['createNote']>>((value) => typeof value === 'function');

/**
 * Validates a resolved folder-note setup.
 *
 * It carries a `resolveName` callback, so — as with {@link noteCreatorSchema} — only its shape at the top
 * level is checkable.
 */
const folderNoteConfigSchema = z.custom<FolderNoteConfig>((value) => typeof value === 'object' && value !== null);

/**
 * Validates the note a link is generated relative to.
 *
 * `TFile` comes from the `obsidian` module, which every plugin shares one instance of, so `instanceof` is
 * safe here in a way it would never be for a class from a bundled library — of which each plugin carries
 * its own copy.
 */
const sourcePathOrFileSchema: z.ZodType<PathOrFile> = z.union([
  z.string(),
  z.custom<TFile>((value) => value instanceof TFile)
]);

/**
 * Validates {@link SelectOptions}.
 *
 * Deliberately loose rather than strict: a consumer compiled against a LATER contract version may pass an
 * option this version has never heard of, and rejecting the whole call for it would make every additive
 * change to the API a breaking one.
 */
const selectOptionsSchema = z.looseObject({
  createNote: noteCreatorSchema.optional(),
  excludedPathPatterns: z.array(z.string()).optional(),
  folderNoteConfig: folderNoteConfigSchema.optional(),
  folderPath: z.string().optional(),
  includeSubfolders: z.boolean().optional(),
  initialQuery: z.string().optional(),
  placeholder: z.string().optional(),
  prefix: z.string().optional(),
  shouldAllowCreate: z.boolean().optional(),
  shouldApplyPrefixSuffixWhenNoLinkSelected: z.boolean().optional(),
  sourcePathOrFile: sourcePathOrFileSchema.optional(),
  suffix: z.string().optional(),
  titlePropertyName: z.string().optional(),
  updatedPropertyName: z.string().optional()
});

/**
 * The contract {@link LINK_PICKER_API_VERSION} of the API satisfies.
 *
 * @remarks
 * Both schemas are SYNCHRONOUS on purpose. An asynchronous one cannot throw into the call it guards —
 * that call has already returned by the time the answer arrives — so its failures are only reported
 * through the debugger, where nobody is looking.
 *
 * Validation runs only while the `obsidian-dev-utils:PluginApi` debugger is enabled, so nothing here
 * costs a production caller anything.
 */
export const LINK_PICKER_API_CONTRACT: PluginApiContract = {
  select: {
    // `input` validates the ARGUMENT LIST, hence a tuple — one member per parameter, and `select` takes one.
    input: z.tuple([selectOptionsSchema]),
    output: z.string()
  }
};

/**
 * What the plugin publishes for other plugins and scripts to call.
 *
 * @remarks
 * A consumer reaches this through `watchPluginApi` from
 * `obsidian-dev-utils/obsidian/plugin/plugin-api`, and declares its own copy of this shape — the plugin
 * is not published to npm, and {@link LINK_PICKER_API_CONTRACT} is what actually checks the two sides
 * agree.
 *
 * A thin delegate rather than the {@link LinkPickerComponent} itself, because publishing the component
 * would publish `load`, `unload` and the rest of the `Component` surface as though they were API, and
 * every one of them would then be something consumers could come to depend on.
 */
export class LinkPickerApi {
  public constructor(private readonly linkPickerComponent: LinkPickerComponent) {}

  /**
   * Opens the picker and resolves with the chosen link text.
   *
   * @param params - Per-call options; anything omitted comes from the plugin's settings.
   * @returns The link text. Rejects when the user dismisses the picker without choosing.
   */
  public async select(params: LinkPickerApiSelectParams): Promise<string> {
    return await this.linkPickerComponent.select(params);
  }
}

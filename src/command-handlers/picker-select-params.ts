import type { PathOrFile } from '@mnaoumov/obsidian-lib/file-system';

import type { LinkPickerComponentSelectParams } from '../picker/link-picker-component.ts';
import type { Picker } from '../settings/plugin-settings.ts';

/**
 * Params for {@link getPickerSelectParams}.
 */
export interface GetPickerSelectParamsParams {
  /**
   * The text the picker's query starts with.
   */
  readonly initialQuery: string;

  /**
   * The display text of the picked link. Empty keeps the row's alias.
   */
  readonly linkDisplayText: string;

  /**
   * The configured picker, or `null` for the generic `Insert link...`.
   */
  readonly picker: null | Picker;

  /**
   * The note the link is inserted into.
   */
  readonly sourcePathOrFile: PathOrFile;
}

/**
 * Builds the options a configured picker, or the generic command, opens the picker with.
 *
 * One place for both ways in, a command and a typed trigger, so the two cannot open the same picker differently.
 *
 * @param params - The params.
 * @returns The options.
 */
export function getPickerSelectParams(params: GetPickerSelectParamsParams): LinkPickerComponentSelectParams {
  const picker = params.picker;

  return {
    folderPath: picker?.folderPath ?? '',
    includeSubfolders: picker?.includeSubfolders ?? false,
    initialQuery: params.initialQuery,
    linkDisplayText: params.linkDisplayText,
    noteCreatorName: picker?.noteCreatorName ?? '',
    placeholder: picker?.placeholder ?? '',
    prefix: picker?.prefix ?? '',
    shouldAllowCreate: picker?.shouldAllowCreate ?? true,
    shouldApplyPrefixSuffixWhenNoLinkSelected: picker?.shouldApplyPrefixSuffixWhenNoLinkSelected ?? false,
    sourcePathOrFile: params.sourcePathOrFile,
    suffix: picker?.suffix ?? ''
  };
}

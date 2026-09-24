import type {
  App,
  TFile
} from 'obsidian';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/file-system';
import type { FolderNoteConfig } from 'obsidian-dev-utils/obsidian/folder-note';

import type { LinkPickerApiSelectParams } from '../api.d.ts';
import type { SegmentMatchMode } from './item.ts';

import { LinkPickerModal } from './link-picker-modal.ts';

/**
 * What a caller passes to {@link select}.
 *
 * An alias of `api.d.ts`'s {@link LinkPickerApiSelectParams} rather than a second declaration of it: the
 * plugin's internal caller-facing shape and its PUBLISHED one are the same shape, and keeping them one
 * type is what stops the published file drifting from the code it describes.
 *
 * It is therefore spelled in the published vocabulary — `folderNoteConfig.location` and
 * `segmentMatchMode` are plain string unions here, not the `obsidian-dev-utils` and `item.ts` enums the
 * internals use, because `api.d.ts` may not import either. {@link SelectParams} is where that becomes
 * concrete, and `link-picker-component.ts` owns the conversion.
 */
export type SelectOptions = LinkPickerApiSelectParams;

/**
 * {@link SelectOptions} with every default already applied — what the modal actually reads.
 */
export interface SelectParams {
  readonly app: App;
  readonly createNote: (this: void, folderPath: string, newNoteTitle: string) => Promise<TFile>;
  readonly excludedPathPatterns: readonly string[];
  readonly folderNoteConfig: FolderNoteConfig;
  readonly folderPath: string;
  readonly includeSubfolders: boolean;
  readonly initialQuery: string;
  readonly placeholder: string;
  readonly prefix: string;
  readonly segmentMatchMode: SegmentMatchMode;
  readonly shouldAllowCreate: boolean;
  readonly shouldApplyPrefixSuffixWhenNoLinkSelected: boolean;
  readonly sourcePathOrFile: PathOrFile;
  readonly suffix: string;
  readonly titlePropertyName: string;
  readonly updatedPropertyName: string;
}

/**
 * Opens the picker and resolves with the chosen link.
 *
 * The result is a STRING rather than a file, because the picker's oldest and most common caller is a
 * template writing a property value: `<prefix><link><suffix>`, or the bare link, or the empty string when
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

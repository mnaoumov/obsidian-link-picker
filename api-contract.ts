/**
 * @file
 *
 * The runtime half of this plugin's published API: its CONTRACT, one entry per method of
 * {@link LinkPickerApi}, each with a schema over the argument list and a schema over the value the method
 * resolves to.
 *
 * This plugin publishes exactly this constant with its API, and a consumer copies it beside `api.d.ts` and
 * passes it as the `contract` when it looks the API up, so both ends validate against ONE definition. The
 * plugin registry checks the payloads against it only while its debugger is on, so nothing here costs a
 * production caller anything.
 *
 * Only the constant and the checks particular to this API live here. Copying it takes two dependencies
 * beside `api.d.ts` and `obsidian`. `@mnaoumov/typescript-lib` carries the contract type, the
 * {@link https://standardschema.dev | Standard Schema} builders and the guard builders, in its `api-contract`
 * and `type-guards` entry points. `@mnaoumov/obsidian-lib` carries the path-or-file guard, in its
 * `file-system` entry point. `api.d.ts` stays dependency-free.
 *
 * `defineApiContract<LinkPickerApi>` checks every entry against its method's signature, and both schemas
 * of every method are required.
 *
 * Every schema is SYNCHRONOUS on purpose. An asynchronous one cannot throw into the call it guards — that
 * call has already returned by the time the answer arrives — so its failures would only be reported through
 * the debugger, where nobody is looking.
 *
 * It is not named `api.ts` because TypeScript would read `api.d.ts` as that file's own declarations.
 */

import type { OptionGuards } from '@mnaoumov/typescript-lib/api-contract';

import { isPathOrFile } from '@mnaoumov/obsidian-lib/file-system';
import {
  BOOLEAN_GUARD,
  createApiContractSchemaBuilders,
  createExpectedTypeGuard,
  defineApiContract,
  literalGuard,
  optionsGuard,
  STRING_ARRAY_GUARD,
  STRING_GUARD
} from '@mnaoumov/typescript-lib/api-contract';
import {
  functionTypeGuard,
  isBoolean,
  isStringArray,
  literalTypeGuard,
  objectTypeGuard
} from '@mnaoumov/typescript-lib/type-guards';

import type {
  FolderNoteConfig,
  LinkPickerApi,
  LinkPickerApiSelectParams,
  SegmentMatchMode
} from './api.d.ts';

const { createArgumentsSchema, createTypeGuardSchema } = createApiContractSchemaBuilders('link-picker');

// Records rather than arrays, so a member added to either union in `api.d.ts` and not here fails to compile.
const SEGMENT_MATCH_MODES: Readonly<Record<SegmentMatchMode, true>> = { Fuzzy: true, Substring: true };

const isFolderNoteConfig = objectTypeGuard<FolderNoteConfig>({
  extensions: isStringArray,
  isHidden: isBoolean,
  location: literalTypeGuard<FolderNoteConfig['location']>({ InsideFolder: true, None: true, ParentFolder: true }),
  resolveName: functionTypeGuard<FolderNoteConfig['resolveName']>()
});

/**
 * The options of {@link LinkPickerApiSelectParams}, each with what it must be when present.
 *
 * Keyed by the declaration, so an option added to `api.d.ts` and not here fails to compile. An option NOT
 * listed is let through: a consumer compiled against a LATER contract version may pass an option this
 * version has never heard of, and rejecting the whole call for it would make every additive change to the
 * API a breaking one.
 */
const SELECT_OPTIONS: OptionGuards<LinkPickerApiSelectParams> = {
  // A cross-plugin call carries the function itself across the boundary, so all that can be said about it is that it is callable.
  // That is still worth saying, because a non-function here fails deep inside the picker rather than at the call that made the mistake.
  createNote: createExpectedTypeGuard('a function', functionTypeGuard<NonNullable<LinkPickerApiSelectParams['createNote']>>()),
  excludedPathPatterns: STRING_ARRAY_GUARD,
  folderNoteConfig: createExpectedTypeGuard('a folder-note config', isFolderNoteConfig),
  folderPath: STRING_GUARD,
  includeSubfolders: BOOLEAN_GUARD,
  initialQuery: STRING_GUARD,
  placeholder: STRING_GUARD,
  prefix: STRING_GUARD,
  segmentMatchMode: literalGuard(SEGMENT_MATCH_MODES),
  shouldAllowCreate: BOOLEAN_GUARD,
  shouldApplyPrefixSuffixWhenNoLinkSelected: BOOLEAN_GUARD,
  sourcePathOrFile: createExpectedTypeGuard('a path or a file', isPathOrFile),
  suffix: STRING_GUARD,
  titlePropertyName: STRING_GUARD,
  updatedPropertyName: STRING_GUARD
};

/**
 * The contract this plugin publishes with {@link LinkPickerApi}, for a consumer to pass as the `contract`
 * when it looks the API up.
 */
export const LINK_PICKER_API_CONTRACT = defineApiContract<LinkPickerApi>({
  select: {
    input: createArgumentsSchema([optionsGuard<LinkPickerApiSelectParams>(SELECT_OPTIONS, { description: 'select options' })]),
    output: createTypeGuardSchema({ ...STRING_GUARD, expected: 'the link text' })
  }
});

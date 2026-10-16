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
 * Only the constant and the checks particular to this API live here. The contract type, the
 * {@link https://standardschema.dev | Standard Schema} builders and the common guards come from
 * `@mnaoumov/typescript-lib/api-contract`, so a consumer copying this file needs that package and
 * `obsidian`, and nothing else. `api.d.ts` stays dependency-free.
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

import type { ExpectedTypeGuard } from '@mnaoumov/typescript-lib/api-contract';

import {
  BOOLEAN_GUARD,
  createArgumentsSchema,
  createTypeGuardSchema,
  defineApiContract,
  STRING_ARRAY_GUARD,
  STRING_GUARD
} from '@mnaoumov/typescript-lib/api-contract';
import { TFile } from 'obsidian';

import type {
  FolderNoteConfig,
  LinkPickerApi,
  LinkPickerApiSelectParams,
  SegmentMatchMode
} from './api.d.ts';

const VENDOR = 'link-picker';

// Records rather than arrays, so a member added to either union in `api.d.ts` and not here fails to compile.
const SEGMENT_MATCH_MODES: Readonly<Record<SegmentMatchMode, true>> = { Fuzzy: true, Substring: true };
const FOLDER_NOTE_LOCATIONS: Readonly<Record<FolderNoteConfig['location'], true>> = { InsideFolder: true, None: true, ParentFolder: true };

/**
 * The options of {@link LinkPickerApiSelectParams}, each with what it must be when present.
 *
 * Keyed by the declaration, so an option added to `api.d.ts` and not here fails to compile. An option NOT
 * listed is let through: a consumer compiled against a LATER contract version may pass an option this
 * version has never heard of, and rejecting the whole call for it would make every additive change to the
 * API a breaking one.
 */
const SELECT_OPTIONS: Readonly<Record<string, ExpectedTypeGuard<unknown>>> = {
  // A cross-plugin call carries the function itself across the boundary, so all that can be said about it is that it is callable.
  // That is still worth saying, because a non-function here fails deep inside the picker rather than at the call that made the mistake.
  createNote: { expected: 'a function', typeGuard: isFunction },
  excludedPathPatterns: STRING_ARRAY_GUARD,
  folderNoteConfig: { expected: 'a folder-note config', typeGuard: isFolderNoteConfig },
  folderPath: STRING_GUARD,
  includeSubfolders: BOOLEAN_GUARD,
  initialQuery: STRING_GUARD,
  placeholder: STRING_GUARD,
  prefix: STRING_GUARD,
  segmentMatchMode: { expected: `one of ${Object.keys(SEGMENT_MATCH_MODES).join(', ')}`, typeGuard: isSegmentMatchMode },
  shouldAllowCreate: BOOLEAN_GUARD,
  shouldApplyPrefixSuffixWhenNoLinkSelected: BOOLEAN_GUARD,
  sourcePathOrFile: { expected: 'a path or a file', typeGuard: isPathOrFile },
  suffix: STRING_GUARD,
  titlePropertyName: STRING_GUARD,
  updatedPropertyName: STRING_GUARD
} satisfies Record<keyof LinkPickerApiSelectParams, ExpectedTypeGuard<unknown>>;

/**
 * The contract this plugin publishes with {@link LinkPickerApi}, for a consumer to pass as the `contract`
 * when it looks the API up.
 */
export const LINK_PICKER_API_CONTRACT = defineApiContract<LinkPickerApi>({
  select: {
    input: createArgumentsSchema([{
      expected: `select options, each of its declared type (${getSelectOptionsDescription()})`,
      typeGuard: isSelectParams
    }], { vendor: VENDOR }),
    output: createTypeGuardSchema({ ...STRING_GUARD, expected: 'the link text', vendor: VENDOR })
  }
});

function getSelectOptionsDescription(): string {
  return Object.entries(SELECT_OPTIONS).map(([optionName, option]) => `${optionName}: ${option.expected}`).join('; ');
}

function isFolderNoteConfig(value: unknown): value is FolderNoteConfig {
  if (!isObject(value)) {
    return false;
  }

  const location: unknown = Reflect.get(value, 'location');
  return STRING_ARRAY_GUARD.typeGuard(Reflect.get(value, 'extensions'))
    && BOOLEAN_GUARD.typeGuard(Reflect.get(value, 'isHidden'))
    && isKeyOf(location, FOLDER_NOTE_LOCATIONS)
    && isFunction(Reflect.get(value, 'resolveName'));
}

function isFunction(value: unknown): value is (...arguments_: unknown[]) => unknown {
  return typeof value === 'function';
}

function isKeyOf<TKey extends string>(value: unknown, record: Readonly<Record<TKey, true>>): value is TKey {
  return STRING_GUARD.typeGuard(value) && Object.hasOwn(record, value);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

// `TFile` comes from the `obsidian` module, which every plugin shares one instance of, so `instanceof` is safe here.
// It would never be for a class from a bundled library, of which each plugin carries its own copy.
function isPathOrFile(value: unknown): value is string | TFile {
  return STRING_GUARD.typeGuard(value) || value instanceof TFile;
}

function isSegmentMatchMode(value: unknown): value is SegmentMatchMode {
  return isKeyOf(value, SEGMENT_MATCH_MODES);
}

function isSelectParams(value: unknown): value is LinkPickerApiSelectParams {
  if (!isObject(value)) {
    return false;
  }

  return Object.entries(SELECT_OPTIONS).every(([optionName, option]) => {
    const optionValue: unknown = Reflect.get(value, optionName);
    return optionValue === undefined || option.typeGuard(optionValue);
  });
}

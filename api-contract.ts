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
 * Copyable for the same reason `api.d.ts` is: it imports from `obsidian` and `./api.d.ts` and nothing else.
 * So the schemas are hand-written {@link https://standardschema.dev | Standard Schema} objects rather than
 * built with a schema library, and the constant is typed structurally rather than as a registry type. A
 * consumer on a library whose contract type is generic over the API (such as
 * `PluginApiContract<LinkPickerApi>`) can assign the constant to it, which checks every entry against its
 * method's signature.
 *
 * Every schema is SYNCHRONOUS on purpose. An asynchronous one cannot throw into the call it guards — that
 * call has already returned by the time the answer arrives — so its failures would only be reported through
 * the debugger, where nobody is looking.
 *
 * It is not named `api.ts` because TypeScript would read `api.d.ts` as that file's own declarations.
 */

import { TFile } from 'obsidian';

import type {
  FolderNoteConfig,
  LinkPickerApi,
  LinkPickerApiSelectParams,
  SegmentMatchMode
} from './api.d.ts';

/**
 * The type of {@link LINK_PICKER_API_CONTRACT}: one entry per method of {@link LinkPickerApi}, each typed
 * against that method's parameters and awaited return value.
 */
export type LinkPickerApiContract = {
  readonly [TMethodName in keyof LinkPickerApi]: LinkPickerApiMethodContract<
    Parameters<LinkPickerApi[TMethodName]>,
    Awaited<ReturnType<LinkPickerApi[TMethodName]>>
  >;
};

/**
 * The payload schemas of one method.
 *
 * @typeParam TParameters - The method's parameters.
 * @typeParam TReturnValue - The method's return value, awaited.
 */
export interface LinkPickerApiMethodContract<TParameters, TReturnValue> {
  /**
   * Validates the method's arguments, as an array.
   */
  readonly input: LinkPickerApiSchema<TParameters>;

  /**
   * Validates the value the method resolves to.
   */
  readonly output: LinkPickerApiSchema<TReturnValue>;
}

/**
 * A {@link https://standardschema.dev | Standard Schema} (`StandardSchemaV1<unknown, T>`), restated with
 * only the members this file uses so it needs no dependency for them.
 *
 * @typeParam T - The type a value that passes is.
 */
export interface LinkPickerApiSchema<T> {
  /**
   * The Standard Schema properties.
   */
  readonly '~standard': LinkPickerApiSchemaProps<T>;
}

/**
 * The result of a value that failed {@link LinkPickerApiSchema}'s `validate`.
 */
export interface LinkPickerApiSchemaFailure {
  /**
   * What was wrong with the value.
   */
  readonly issues: readonly LinkPickerApiSchemaIssue[];
}

/**
 * One thing wrong with a value.
 */
export interface LinkPickerApiSchemaIssue {
  /**
   * What was expected.
   */
  readonly message: string;

  /**
   * Where in the value, e.g. `[0, 'folderPath']` for that option of the first argument; absent for the
   * value as a whole.
   */
  readonly path?: readonly PropertyKey[];
}

/**
 * The Standard Schema properties of {@link LinkPickerApiSchema}.
 *
 * @typeParam T - The type a value that passes is.
 */
export interface LinkPickerApiSchemaProps<T> {
  /**
   * The inferred types, present for type inference only.
   */
  readonly types?: LinkPickerApiSchemaTypes<T> | undefined;

  /**
   * Validates a value.
   *
   * @param value - The value to validate.
   * @returns The value when it passes; otherwise the issues found.
   */
  readonly validate: (value: unknown) => LinkPickerApiSchemaResult<T>;

  /**
   * Who made the schema.
   */
  readonly vendor: string;

  /**
   * The Standard Schema version.
   */
  readonly version: 1;
}

/**
 * The result of {@link LinkPickerApiSchema}'s `validate`.
 *
 * @typeParam T - The type a value that passes is.
 */
export type LinkPickerApiSchemaResult<T> = LinkPickerApiSchemaFailure | LinkPickerApiSchemaSuccess<T>;

/**
 * The result of a value that passed {@link LinkPickerApiSchema}'s `validate`.
 *
 * @typeParam T - The type a value that passes is.
 */
export interface LinkPickerApiSchemaSuccess<T> {
  /**
   * Absent on success.
   */
  readonly issues?: undefined;

  /**
   * The value.
   */
  readonly value: T;
}

/**
 * The types a schema infers, present for type inference only.
 *
 * @typeParam T - The type a value that passes is.
 */
export interface LinkPickerApiSchemaTypes<T> {
  /**
   * The type the schema accepts.
   */
  readonly input: unknown;

  /**
   * The type a value that passes is.
   */
  readonly output: T;
}

interface ValueSchemaParams {
  readonly expected: string;
  readonly isValid: (value: unknown) => boolean;
}

const VENDOR = 'link-picker';

const BOOLEAN: ValueSchemaParams = { expected: 'a boolean', isValid: isBoolean };
const STRING: ValueSchemaParams = { expected: 'a string', isValid: isString };

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
const SELECT_OPTIONS: Readonly<Record<string, ValueSchemaParams>> = {
  // A cross-plugin call carries the function itself across the boundary, so all that can be said about it is that it is callable.
  // That is still worth saying, because a non-function here fails deep inside the picker rather than at the call that made the mistake.
  createNote: { expected: 'a function', isValid: isFunction },
  excludedPathPatterns: { expected: 'an array of strings', isValid: isStringArray },
  folderNoteConfig: { expected: 'a folder-note config', isValid: isFolderNoteConfig },
  folderPath: STRING,
  includeSubfolders: BOOLEAN,
  initialQuery: STRING,
  placeholder: STRING,
  prefix: STRING,
  segmentMatchMode: { expected: `one of ${Object.keys(SEGMENT_MATCH_MODES).join(', ')}`, isValid: isSegmentMatchMode },
  shouldAllowCreate: BOOLEAN,
  shouldApplyPrefixSuffixWhenNoLinkSelected: BOOLEAN,
  sourcePathOrFile: { expected: 'a path or a file', isValid: isPathOrFile },
  suffix: STRING,
  titlePropertyName: STRING,
  updatedPropertyName: STRING
} satisfies Record<keyof LinkPickerApiSelectParams, ValueSchemaParams>;

/**
 * The contract this plugin publishes with {@link LinkPickerApi}, for a consumer to pass as the `contract`
 * when it looks the API up.
 */
export const LINK_PICKER_API_CONTRACT: LinkPickerApiContract = {
  select: {
    input: createSchema<[params: LinkPickerApiSelectParams]>(getSelectArgumentsIssues),
    output: createSchema<string>((value) => isString(value) ? [] : [{ message: 'Expected the link text.' }])
  }
};

function createSchema<T>(getIssues: (value: unknown) => LinkPickerApiSchemaIssue[]): LinkPickerApiSchema<T> {
  function isValid(value: unknown): value is T {
    return getIssues(value).length === 0;
  }

  return {
    '~standard': {
      validate: (value): LinkPickerApiSchemaResult<T> => isValid(value) ? { value } : { issues: getIssues(value) },
      vendor: VENDOR,
      version: 1
    }
  };
}

function getSelectArgumentsIssues(value: unknown): LinkPickerApiSchemaIssue[] {
  if (!Array.isArray(value)) {
    return [{ message: 'Expected an argument list.' }];
  }

  if (value.length !== 1) {
    return [{ message: `Expected 1 argument, got ${String(value.length)}.` }];
  }

  const params: unknown = value[0];
  if (!isObject(params)) {
    return [{ message: 'Expected an options object.', path: [0] }];
  }

  return Object.entries(SELECT_OPTIONS).flatMap(([optionName, option]) => {
    const optionValue: unknown = Reflect.get(params, optionName);
    return optionValue === undefined || option.isValid(optionValue)
      ? []
      : [{ message: `Expected ${option.expected}.`, path: [0, optionName] }];
  });
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFolderNoteConfig(value: unknown): value is FolderNoteConfig {
  if (!isObject(value)) {
    return false;
  }

  const location: unknown = Reflect.get(value, 'location');
  return isStringArray(Reflect.get(value, 'extensions'))
    && isBoolean(Reflect.get(value, 'isHidden'))
    && isKeyOf(location, FOLDER_NOTE_LOCATIONS)
    && isFunction(Reflect.get(value, 'resolveName'));
}

function isFunction(value: unknown): value is (...arguments_: unknown[]) => unknown {
  return typeof value === 'function';
}

function isKeyOf<TKey extends string>(value: unknown, record: Readonly<Record<TKey, true>>): value is TKey {
  return isString(value) && Object.hasOwn(record, value);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

// `TFile` comes from the `obsidian` module, which every plugin shares one instance of, so `instanceof` is safe here.
// It would never be for a class from a bundled library, of which each plugin carries its own copy.
function isPathOrFile(value: unknown): value is string | TFile {
  return isString(value) || value instanceof TFile;
}

function isSegmentMatchMode(value: unknown): value is SegmentMatchMode {
  return isKeyOf(value, SEGMENT_MATCH_MODES);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isString(item));
}

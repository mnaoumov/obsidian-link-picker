import type { ApiMethodContract } from '@mnaoumov/typescript-lib/api-contract';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TFile } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  App as AppCls,
  TFile as TFileCls
} from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  LinkPickerApi as LinkPickerApiDeclaration,
  LinkPickerApiSelectParams
} from '../api.d.ts';
import type { LinkPickerComponent } from './link-picker-component.ts';

import { LINK_PICKER_API_CONTRACT as COPYABLE_LINK_PICKER_API_CONTRACT } from '../api-contract.ts';
import { SegmentMatchMode } from './item.ts';
import {
  LINK_PICKER_API_CONTRACT,
  LINK_PICKER_API_VERSION,
  LinkPickerApi
} from './link-picker-api.ts';

const selectContract = castTo<ApiMethodContract>(LINK_PICKER_API_CONTRACT.select);

const SELECT_OPTIONS_MESSAGE = 'Expected select options: { createNote?: a function; excludedPathPatterns?: an array of strings; folderNoteConfig?: a folder-note config; folderPath?: a string; includeSubfolders?: a boolean; initialQuery?: a string; placeholder?: a string; prefix?: a string; segmentMatchMode?: one of \'Fuzzy\', \'Substring\'; shouldAllowCreate?: a boolean; shouldApplyPrefixSuffixWhenNoLinkSelected?: a boolean; sourcePathOrFile?: a path or a file; suffix?: a string; titlePropertyName?: a string; updatedPropertyName?: a string }.';

describe('LINK_PICKER_API_VERSION', () => {
  it('should be a semver version, because a consumer pins a range against it', () => {
    expect(LINK_PICKER_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('LinkPickerApi', () => {
  it('should delegate to the picker, so the published surface adds no behavior of its own', async () => {
    const select = vi.fn(() => Promise.resolve('Person: [[Ada]]'));

    // Held through the DECLARATION in `api.d.ts`, not through the class, so the call below is typed the way a
    // consumer's is — which is what proves the `implements` link reaches a call site rather than only a header.
    const api: LinkPickerApiDeclaration = new LinkPickerApi(strictProxy<LinkPickerComponent>({ select }));
    const params: LinkPickerApiSelectParams = { folderPath: 'People' };

    expect(await api.select(params)).toBe('Person: [[Ada]]');
    expect(select).toHaveBeenCalledExactlyOnceWith(params);
  });
});

describe('LINK_PICKER_API_CONTRACT', () => {
  describe('the input schema', () => {
    it('should accept an empty options bag, since every option is optional', () => {
      expect(validateInput([{}])).toEqual([]);
    });

    it('should accept every option at its declared type', () => {
      const issues = validateInput([{
        createNote: (): Promise<TFile> => Promise.resolve(castTo<TFile>({})),
        excludedPathPatterns: ['/!!files'],
        folderNoteConfig: { extensions: ['md'], isHidden: false, location: 'InsideFolder', resolveName: (): string => '' },
        folderPath: 'People',
        includeSubfolders: true,
        initialQuery: 'Ada',
        placeholder: 'Who?',
        prefix: 'Person: ',
        segmentMatchMode: SegmentMatchMode.Fuzzy,
        shouldAllowCreate: false,
        shouldApplyPrefixSuffixWhenNoLinkSelected: true,
        sourcePathOrFile: 'notes/note.md',
        suffix: ' (done)',
        titlePropertyName: 'title',
        updatedPropertyName: 'updated'
      }]);

      expect(issues).toEqual([]);
    });

    it('should reject an option at the wrong type', () => {
      expect(validateInput([{ folderPath: 42 }])).not.toEqual([]);
    });

    it('should reject a non-boolean where the empty-result switch belongs', () => {
      expect(validateInput([{ shouldApplyPrefixSuffixWhenNoLinkSelected: 'yes' }])).not.toEqual([]);
    });

    it('should reject a match mode outside the enum, which a plain string check would let through', () => {
      expect(validateInput([{ segmentMatchMode: 'Substringish' }])).not.toEqual([]);
    });

    it('should reject a `createNote` that is not callable, which would otherwise fail deep inside the picker', () => {
      expect(validateInput([{ createNote: 'People/Ada.md' }])).not.toEqual([]);
    });

    it('should accept a `TFile` source as well as a path', () => {
      // A REAL `TFile`, not a `strictProxy` of one: the schema tests it with `instanceof`, which is safe
      // here precisely because `TFile` comes from the one `obsidian` module every plugin shares.
      const app = AppCls.createConfigured__();
      const file = TFileCls.create__(app.vault, 'People/Ada.md').asOriginalType2__();

      expect(validateInput([{ sourcePathOrFile: file }])).toEqual([]);
    });

    it('should reject a source that is neither', () => {
      expect(validateInput([{ sourcePathOrFile: 42 }])).not.toEqual([]);
    });

    it('should accept an option it has never heard of, so an additive contract change is not a breaking one', () => {
      expect(validateInput([{ optionFromALaterVersion: true }])).toEqual([]);
    });

    it('should reject an argument list that is not one options bag', () => {
      expect(validateInput(['People'])).not.toEqual([]);
      expect(validateInput([null])).not.toEqual([]);
    });

    it('should reject a missing or an extra argument', () => {
      expect(validateInput([])).toEqual([{ message: SELECT_OPTIONS_MESSAGE, path: [0] }]);
      expect(validateInput([{}, {}])).toEqual([{ message: 'Expected at most 1 argument(s), got 2.' }]);
    });

    it('should reject a value that is not an argument list at all', () => {
      expect(validateInput({})).toEqual([{ message: 'Expected an argument list.' }]);
    });

    it('should reject a folder-note config missing any of its members, now that the whole shape is checked', () => {
      const folderNoteConfig = { extensions: ['md'], isHidden: false, location: 'InsideFolder', resolveName: (): string => '' };

      for (
        const broken of [
          null,
          {},
          { ...folderNoteConfig, extensions: [1] },
          { ...folderNoteConfig, isHidden: 'no' },
          { ...folderNoteConfig, location: 'Auto' },
          { ...folderNoteConfig, location: 1 },
          { ...folderNoteConfig, resolveName: 'name' }
        ]
      ) {
        expect(validateInput([{ folderNoteConfig: broken }])).toEqual([{ message: SELECT_OPTIONS_MESSAGE, path: [0] }]);
      }
    });

    it('should say what every option expects, in the one issue it reports for the options argument', () => {
      expect(validateInput([{ excludedPathPatterns: 'x', folderPath: 42, segmentMatchMode: 'Substringish' }])).toEqual([
        { message: SELECT_OPTIONS_MESSAGE, path: [0] }
      ]);
      expect(SELECT_OPTIONS_MESSAGE).toContain('excludedPathPatterns?: an array of strings');
      expect(SELECT_OPTIONS_MESSAGE).toContain('folderNoteConfig?: a folder-note config');
      expect(SELECT_OPTIONS_MESSAGE).toContain('segmentMatchMode?: one of \'Fuzzy\', \'Substring\'');
    });

    it('should hand a valid argument list back unchanged', () => {
      const value = [{ folderPath: 'People' }];

      expect(validate(castTo<StandardSchemaV1>(selectContract.input), value)).toEqual({ value });
    });
  });

  describe('the output schema', () => {
    it('should accept the link text', () => {
      expect(validateOutput('Person: [[Ada]]')).toEqual([]);
    });

    it('should accept the empty string, which is how declining a link comes back', () => {
      expect(validateOutput('')).toEqual([]);
    });

    it('should reject a non-string, which is what a provider on a later contract might return', () => {
      expect(validateOutput({ path: 'People/Ada.md' })).toEqual([{ message: 'Expected the link text.' }]);
    });
  });

  it('should be the copyable root constant, so the provider and its consumers check one definition', () => {
    expect(LINK_PICKER_API_CONTRACT).toBe(COPYABLE_LINK_PICKER_API_CONTRACT);
    expect(Object.keys(LINK_PICKER_API_CONTRACT)).toEqual(['select']);
    expect(castTo<StandardSchemaV1>(selectContract.input)['~standard']).toMatchObject({ vendor: 'link-picker', version: 1 });
    expect(castTo<StandardSchemaV1>(selectContract.output)['~standard']).toMatchObject({ vendor: 'link-picker', version: 1 });
  });

  it('should validate synchronously, because an async schema cannot throw into the call it guards', () => {
    expect(validate(castTo<StandardSchemaV1>(selectContract.input), [{}])).not.toBeInstanceOf(Promise);
    expect(validate(castTo<StandardSchemaV1>(selectContract.output), '')).not.toBeInstanceOf(Promise);
  });
});

function validate(schema: StandardSchemaV1, value: unknown): PromiseLike<StandardSchemaV1.Result<unknown>> | StandardSchemaV1.Result<unknown> {
  return schema['~standard'].validate(value);
}

function validateInput(value: unknown): readonly StandardSchemaV1.Issue[] {
  return validateSync(castTo<StandardSchemaV1>(selectContract.input), value);
}

function validateOutput(value: unknown): readonly StandardSchemaV1.Issue[] {
  return validateSync(castTo<StandardSchemaV1>(selectContract.output), value);
}

function validateSync(schema: StandardSchemaV1, value: unknown): readonly StandardSchemaV1.Issue[] {
  const result = validate(schema, value);

  if ('then' in result) {
    throw new TypeError('The schema answered asynchronously.');
  }

  return result.issues ?? [];
}

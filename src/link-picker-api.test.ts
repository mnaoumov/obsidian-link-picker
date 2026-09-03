import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TFile } from 'obsidian';
import type { PluginApiMethodContract } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
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

import type { LinkPickerApiSelectParams } from './link-picker-api.ts';
import type { LinkPickerComponent } from './link-picker-component.ts';

import { SegmentMatchMode } from './item.ts';
import {
  LINK_PICKER_API_CONTRACT,
  LINK_PICKER_API_VERSION,
  LinkPickerApi
} from './link-picker-api.ts';

const selectContract = castTo<PluginApiMethodContract>(LINK_PICKER_API_CONTRACT['select']);

describe('LINK_PICKER_API_VERSION', () => {
  it('should be a semver version, because a consumer pins a range against it', () => {
    expect(LINK_PICKER_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('LinkPickerApi', () => {
  it('should delegate to the picker, so the published surface adds no behavior of its own', async () => {
    const select = vi.fn(() => Promise.resolve('Person: [[Ada]]'));
    const api = new LinkPickerApi(strictProxy<LinkPickerComponent>({ select }));
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
        folderNoteConfig: {},
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
      // Here precisely because `TFile` comes from the one `obsidian` module every plugin shares.
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
      expect(validateOutput({ path: 'People/Ada.md' })).not.toEqual([]);
    });
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

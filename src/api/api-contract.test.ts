import type { ApiMethodCases } from '@mnaoumov/typescript-lib/api-contract-verifier';

import {
  validateSync,
  verifyApiContract
} from '@mnaoumov/typescript-lib/api-contract-verifier';
import {
  App,
  TFile,
  TFolder
} from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinkPickerApi } from '../../api.d.ts';

import { LINK_PICKER_API_CONTRACT } from '../../api-contract.ts';

const app = App.createConfigured__();
const file = TFile.create__(app.vault, 'People/Ada.md').asOriginalType__();
const folder = TFolder.create__(app.vault, 'People').asOriginalType__();

const INHERITED_WRONG_FOLDER_PATH: unknown = Object.create({ folderPath: 42 });

const FOLDER_NOTE_CONFIG = { extensions: ['md'], isHidden: false, location: 'InsideFolder', resolveName: vi.fn(() => '') };

const CASES: Record<keyof LinkPickerApi, ApiMethodCases> = {
  select: {
    input: {
      invalid: [
        [],
        [null],
        ['People'],
        [{}, {}],
        // A function is not an options bag, as before the guards moved to `@mnaoumov/typescript-lib`.
        [vi.fn()],
        [{ createNote: 'People/Ada.md' }],
        [{ excludedPathPatterns: '/!!files' }],
        [{ excludedPathPatterns: [1] }],
        [{ folderNoteConfig: null }],
        [{ folderNoteConfig: {} }],
        [{ folderNoteConfig: vi.fn() }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, extensions: [1] } }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, isHidden: 'no' } }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, location: 'Auto' } }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, location: 1 } }],
        // An inherited key of the literal record is not a location: the record is tested with `Object.hasOwn`.
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, location: 'toString' } }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, resolveName: 'name' } }],
        [{ folderPath: 42 }],
        [{ includeSubfolders: 'yes' }],
        [{ initialQuery: 1 }],
        [{ placeholder: 1 }],
        [{ prefix: 1 }],
        [{ segmentMatchMode: 'Substringish' }],
        [{ shouldAllowCreate: 1 }],
        [{ shouldApplyPrefixSuffixWhenNoLinkSelected: 'yes' }],
        [{ sourcePathOrFile: 42 }],
        [{ sourcePathOrFile: folder }],
        [{ suffix: 1 }],
        [{ titlePropertyName: 1 }],
        [{ updatedPropertyName: 1 }],
        // An option is read with `Reflect.get`, so an inherited one is checked too, as before the move.
        [INHERITED_WRONG_FOLDER_PATH],
        { folderPath: 'People' }
      ],
      valid: [
        [{}],
        // An explicitly `undefined` option reads as an absent one.
        [{ folderPath: undefined }],
        [{
          createNote: vi.fn(),
          excludedPathPatterns: ['/!!files'],
          folderNoteConfig: FOLDER_NOTE_CONFIG,
          folderPath: 'People',
          includeSubfolders: true,
          initialQuery: 'Ada',
          placeholder: 'Who?',
          prefix: 'Person: ',
          segmentMatchMode: 'Fuzzy',
          shouldAllowCreate: false,
          shouldApplyPrefixSuffixWhenNoLinkSelected: true,
          sourcePathOrFile: file,
          suffix: ' (done)',
          titlePropertyName: 'title',
          updatedPropertyName: 'updated'
        }],
        [{ segmentMatchMode: 'Substring', sourcePathOrFile: 'People/Ada.md' }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, location: 'None' } }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, location: 'ParentFolder' } }],
        // A key neither shape names is let through, as before the guards moved to `@mnaoumov/typescript-lib`.
        [{ optionFromALaterVersion: true }],
        [{ folderNoteConfig: { ...FOLDER_NOTE_CONFIG, memberFromALaterVersion: true } }],
        // An array is an object to the guard, and has none of the options, as before the move.
        [[]]
      ]
    },
    output: { invalid: [null, undefined, 1, { path: 'People/Ada.md' }], valid: ['', 'Person: [[Ada]]'] }
  }
};

describe('LINK_PICKER_API_CONTRACT', () => {
  it('should pass the contract verification', async () => {
    expect(await verifyApiContract(LINK_PICKER_API_CONTRACT, { cases: CASES, vendor: 'link-picker' })).toEqual([]);
  });

  it('should name the failing argument and what it expected', () => {
    expect(validateSync(LINK_PICKER_API_CONTRACT.select.output, 1)).toEqual({
      issues: [{ message: 'Expected the link text.' }]
    });
    expect(validateSync(LINK_PICKER_API_CONTRACT.select.input, 'People')).toEqual({
      issues: [{ message: 'Expected an argument list.' }]
    });
    expect(validateSync(LINK_PICKER_API_CONTRACT.select.input, [{}, {}])).toEqual({
      issues: [{ message: 'Expected at most 1 argument(s), got 2.' }]
    });
  });
});

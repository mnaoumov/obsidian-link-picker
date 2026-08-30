import type { App as AppOriginal } from 'obsidian';

import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  Item,
  SortContext
} from './item.ts';

import {
  applyQuery,
  fillLowerCaseFields,
  PARENT_RELATIVE_PATH,
  sortItems
} from './item.ts';

const VAULT_FILES: Record<string, string> = {
  'Legal/!.md': 'folder note',
  'Legal/Court.md': 'body',
  'Legal/Court/!.md': 'nested folder note',
  'Legal/Court/Supreme Court.md': 'body',
  'Legal/Judge.md': 'body',
  'Legal/Judgement.md': 'body',
  'Legal/Judge Smith.md': 'body'
};

const app: AppOriginal = App.createConfigured__({ files: VAULT_FILES }).asOriginalType__();

interface BuildItemOptions {
  readonly aliases?: string[];
  readonly isFolderNote?: boolean;
  readonly relativePath?: string;
  readonly updated?: string;
}

function buildItem(path: string, options: BuildItemOptions = {}): Item {
  const file = app.vault.getAbstractFileByPath(path);
  const item: Item = {
    aliases: options.aliases ?? [],
    file: ensureNonNullable(file),
    isFolder: app.vault.getFolderByPath(path) !== null,
    lowerCaseExtension: '',
    lowerCasePathParts: [],
    lowerCaseRelativePath: '',
    lowerCaseTitles: [],
    relativePath: options.relativePath ?? path,
    updated: options.updated ?? ''
  };

  fillLowerCaseFields(item, options.isFolderNote ?? false);
  return item;
}

function buildSortContext(overrides: Partial<SortContext> = {}): SortContext {
  return {
    folderNoteRelativePath: '',
    lastOpenFileIndexMap: new Map<string, number>(),
    shouldSortByUpdatedDate: false,
    ...overrides
  };
}

function sortedPaths(items: readonly Item[], query: string, sortContext: SortContext = buildSortContext()): string[] {
  return sortItems(items, query, sortContext).map((item) => item.relativePath);
}

describe('fillLowerCaseFields', () => {
  it('should split the relative path into matchable parts', () => {
    const item = buildItem('Legal/Court/Supreme Court.md', { relativePath: 'Court/Supreme Court.md' });

    expect(item.lowerCaseRelativePath).toBe('court/supreme court.md');
    expect(item.lowerCasePathParts).toEqual(['court', 'supreme court.md']);
    expect(item.lowerCaseExtension).toBe('md');
  });

  it('should title a plain note by its full name, extension included', () => {
    const item = buildItem('Legal/Judge.md');

    expect(item.lowerCaseTitles).toEqual(['judge.md']);
  });

  it('should title a folder note by its own name, since the folder supplies the meaning', () => {
    const item = buildItem('Legal/!.md', { isFolderNote: true });

    expect(item.lowerCaseTitles).toEqual(['!']);
  });

  it('should make every alias both a title and a path part', () => {
    const item = buildItem('Legal/Judge.md', { aliases: ['The Judge'] });

    expect(item.lowerCaseTitles).toEqual(['judge.md', 'the judge']);
    expect(item.lowerCasePathParts).toContain('the judge');
  });

  it('should leave a folder without an extension even when its name contains a dot', () => {
    const item = buildItem('Legal');

    expect(item.isFolder).toBe(true);
    expect(item.lowerCaseExtension).toBe('');
  });
});

describe('applyQuery', () => {
  it('should treat a bare basename as an exact match, supplying the extension', () => {
    const queryItem = applyQuery('judge', buildItem('Legal/Judge.md'));

    expect(queryItem.isExactMatch).toBe(true);
    expect(queryItem.isStartFrom).toBe(true);
    expect(queryItem.isMatch).toBe(true);
  });

  it('should not call a prefix an exact match', () => {
    const queryItem = applyQuery('judge', buildItem('Legal/Judgement.md'));

    expect(queryItem.isExactMatch).toBe(false);
    expect(queryItem.isStartFrom).toBe(true);
  });

  it('should match an alias exactly', () => {
    const queryItem = applyQuery('the judge', buildItem('Legal/Judge.md', { aliases: ['The Judge'] }));

    expect(queryItem.isExactMatch).toBe(true);
  });

  it('should be case insensitive', () => {
    const queryItem = applyQuery('JUDGE', buildItem('Legal/Judge.md'));

    expect(queryItem.isExactMatch).toBe(true);
  });

  it('should split a query on spaces and slashes and require every term', () => {
    const item = buildItem('Legal/Court/Supreme Court.md', { relativePath: 'Court/Supreme Court.md' });

    expect(applyQuery('court supreme', item).isIncludeEveryTerm).toBe(true);
    expect(applyQuery('court/supreme', item).isIncludeEveryTerm).toBe(true);
    expect(applyQuery('court missing', item).isIncludeEveryTerm).toBe(false);
  });

  it('should report a path match only when the query itself carries a slash', () => {
    const item = buildItem('Legal/Court/Supreme Court.md', { relativePath: 'Court/Supreme Court.md' });

    expect(applyQuery('court/supreme', item).isPathInclude).toBe(true);
    expect(applyQuery('court', item).isPathInclude).toBe(false);
  });

  it('should distinguish a whole-part match from a substring one', () => {
    const item = buildItem('Legal/Judgement.md');

    expect(applyQuery('judgement.md', item).isEqualToEveryTerm).toBe(true);
    expect(applyQuery('judge', item).isEqualToEveryTerm).toBe(false);
    expect(applyQuery('judge', item).isStartFromEveryTerm).toBe(true);
  });

  it('should show exactly the items it ranks', () => {
    const item = buildItem('Legal/Judge.md');

    expect(applyQuery('judge', item).isMatch).toBe(applyQuery('judge', item).isIncludeEveryTerm);
    expect(applyQuery('absent', item).isMatch).toBe(false);
  });

  it('should match everything on an empty query', () => {
    expect(applyQuery('', buildItem('Legal/Judge.md')).isMatch).toBe(true);
  });
});

describe('sortItems', () => {
  it('should drop items the query does not match', () => {
    const items = [buildItem('Legal/Judge.md'), buildItem('Legal/Court/Supreme Court.md')];

    expect(sortedPaths(items, 'judge')).toEqual(['Legal/Judge.md']);
  });

  it('should rank an exact match above a prefix match above a substring match', () => {
    const items = [
      buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md' }),
      buildItem('Legal/Judge Smith.md', { relativePath: 'Prejudge Smith.md' }),
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' })
    ];

    expect(sortedPaths(items, 'judge')).toEqual(['Judge.md', 'Judgement.md', 'Prejudge Smith.md']);
  });

  it('should lead with folders inside a tier', () => {
    // Both are exact matches for `court` — the note via its extension-appended title, the folder via its name — so the tie is broken by the folders-first rule rather than by the tier.
    const items = [
      buildItem('Legal/Court.md', { relativePath: 'Court.md' }),
      buildItem('Legal/Court', { relativePath: 'Court' })
    ];

    expect(sortedPaths(items, 'court')).toEqual(['Court', 'Court.md']);
  });

  it('should pin the parent-folder row to the top regardless of query', () => {
    const items = [
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' }),
      buildItem('Legal', { relativePath: PARENT_RELATIVE_PATH })
    ];

    expect(sortedPaths(items, '')[0]).toBe(PARENT_RELATIVE_PATH);
  });

  it('should place the current folder\'s own note directly below the parent row', () => {
    const items = [
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' }),
      buildItem('Legal/!.md', { isFolderNote: true, relativePath: '!.md' }),
      buildItem('Legal', { relativePath: PARENT_RELATIVE_PATH })
    ];

    expect(sortedPaths(items, '', buildSortContext({ folderNoteRelativePath: '!.md' })))
      .toEqual([PARENT_RELATIVE_PATH, '!.md', 'Judge.md']);
  });

  it('should rank recently opened files first when sorting by updated date', () => {
    const recent = buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md' });
    const items = [buildItem('Legal/Judge.md', { relativePath: 'Judge.md' }), recent];

    const sortContext = buildSortContext({
      lastOpenFileIndexMap: new Map([[recent.file.path, 0]]),
      shouldSortByUpdatedDate: true
    });

    expect(sortedPaths(items, '', sortContext)).toEqual(['Judgement.md', 'Judge.md']);
  });

  it('should order by updated descending when nothing is typed', () => {
    const items = [
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md', updated: '2020-01-01' }),
      buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md', updated: '2026-01-01' })
    ];

    expect(sortedPaths(items, '', buildSortContext({ shouldSortByUpdatedDate: true })))
      .toEqual(['Judgement.md', 'Judge.md']);
  });

  it('should stop consulting the updated date once the user types', () => {
    const items = [
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md', updated: '2020-01-01' }),
      buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md', updated: '2026-01-01' })
    ];

    expect(sortedPaths(items, 'judge', buildSortContext({ shouldSortByUpdatedDate: true })))
      .toEqual(['Judge.md', 'Judgement.md']);
  });

  it('should rank shallower paths first', () => {
    const items = [
      buildItem('Legal/Court/Supreme Court.md', { relativePath: 'Court/Supreme Court.md' }),
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' })
    ];

    expect(sortedPaths(items, '')).toEqual(['Judge.md', 'Court/Supreme Court.md']);
  });

  it('should break a path tie on the alias', () => {
    const items = [
      buildItem('Legal/Judge.md', { aliases: ['Zeta'], relativePath: 'Judge.md' }),
      buildItem('Legal/Judge.md', { aliases: ['Alpha'], relativePath: 'Judge.md' })
    ];

    expect(sortItems(items, '', buildSortContext()).map((item) => item.aliases[0])).toEqual(['Alpha', 'Zeta']);
  });

  it('should lead with folders on an empty query when not sorting by updated date', () => {
    const items = [
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' }),
      buildItem('Legal/Court', { relativePath: 'Court' })
    ];

    expect(sortedPaths(items, '')).toEqual(['Court', 'Judge.md']);
  });

  it('should fall back to the path when two notes were updated at the same moment', () => {
    const items = [
      buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md', updated: '2020-01-01' }),
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md', updated: '2020-01-01' })
    ];

    expect(sortedPaths(items, '', buildSortContext({ shouldSortByUpdatedDate: true }))).toEqual(['Judge.md', 'Judgement.md']);
  });

  it('should let the query outrank the updated date once the user has typed', () => {
    // `u e` ties on every ranking tier, so the ordering reaches the file properties — where the newer
    // Note would win if the date still counted. It does not: what was typed decides.
    const items = [
      buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md', updated: '2030-01-01' }),
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md', updated: '2020-01-01' })
    ];

    expect(sortedPaths(items, 'u e', buildSortContext({ shouldSortByUpdatedDate: true }))).toEqual(['Judge.md', 'Judgement.md']);
  });

  it('should put a row with no alias before the same note under one', () => {
    const items = [
      buildItem('Legal/Judge.md', { aliases: ['Alpha'], relativePath: 'Judge.md' }),
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' })
    ];

    expect(sortItems(items, '', buildSortContext()).map((item) => item.aliases[0] ?? '')).toEqual(['', 'Alpha']);
  });

  it('should fall through every tier to the path when two notes match only by containing the terms', () => {
    // Neither note starts with, equals, or has a path part beginning with `u` or `e`, so all six ranking
    // Tiers tie and the ordering falls back to the file properties.
    const items = [
      buildItem('Legal/Judgement.md', { relativePath: 'Judgement.md' }),
      buildItem('Legal/Judge.md', { relativePath: 'Judge.md' })
    ];

    expect(sortedPaths(items, 'u e')).toEqual(['Judge.md', 'Judgement.md']);
  });
});

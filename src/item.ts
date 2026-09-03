import type { TAbstractFile } from 'obsidian';

/**
 * How one term of the query is tested against one part of a path.
 *
 * The two disagree about something real rather than cosmetic: whether `Brv` should find `Bravo`. A vault
 * whose names are long and typed in a hurry wants it to; one that relies on the picker's determinism does
 * not, which is why {@link SegmentMatchMode.Substring} is the default.
 */
export enum SegmentMatchMode {
  /**
   * The term's characters appear inside the path part in order, but need not be contiguous — the way
   * Obsidian's own search works. Finds more, including things you did not mean.
   */
  Fuzzy = 'Fuzzy',

  /**
   * The term appears inside the path part as one unbroken run. The default, and the only rule the picker
   * had before the setting existed.
   */
  Substring = 'Substring'
}

/**
 * The relative path of the synthetic item that navigates out of the current folder.
 */
export const PARENT_RELATIVE_PATH = '..';

/**
 * Sorts after every real index, so an item nobody has opened recently ranks below every item that has
 * been. Not `Infinity`: the value is subtracted, and `Infinity - Infinity` is `NaN`, which would make the
 * comparator inconsistent rather than merely last.
 */
const NEVER_OPENED_INDEX = Number.MAX_SAFE_INTEGER;

/**
 * Params for {@link applyQuery}.
 */
export interface ApplyQueryParams {
  /**
   * The item to test.
   */
  readonly item: Item;

  /**
   * How one query term is tested against one path part.
   */
  readonly mode: SegmentMatchMode;

  /**
   * The raw query, lower-cased here rather than by the caller.
   */
  readonly query: string;
}

/**
 * One row in the picker.
 *
 * A note with aliases yields one item PER alias — the alias is what the row matches and displays, so two
 * aliases of the same note are two rows that rank independently. The lower-cased fields are precomputed
 * because {@link applyQuery} runs over every item on every keystroke.
 */
export interface Item {
  /**
   * The aliases this row represents. Empty for the row representing the note's own name.
   */
  aliases: string[];

  file: TAbstractFile;
  isFolder: boolean;
  lowerCaseExtension: string;

  /**
   * {@link lowerCaseRelativePath} split on `/`, plus each alias — the units a space/slash-separated query
   * term is matched against.
   */
  lowerCasePathParts: string[];

  lowerCaseRelativePath: string;

  /**
   * The names this row answers to: the file's name (or basename, for a folder note) plus its aliases.
   */
  lowerCaseTitles: string[];

  /**
   * The path relative to the folder the picker is currently rooted at.
   */
  relativePath: string;

  /**
   * The last-updated stamp used by the sort-by-updated ordering, as a string that sorts lexicographically
   * (an ISO timestamp does; so does a zero-padded epoch). Empty means unknown, which sorts last.
   */
  updated: string;
}

/**
 * An {@link Item} with one query's match facts already computed.
 *
 * The seven booleans are the ranking tiers, in the order {@link QUERY_RANK_TIERS} applies them. They are
 * deliberately independent rather than a single score: a template author wants to know that typing a
 * note's exact name puts it first, and a fuzzy score cannot promise that.
 */
export interface QueryItem {
  isEqualToEveryTerm: boolean;
  isExactMatch: boolean;
  isIncludeEveryTerm: boolean;
  isMatch: boolean;
  isPathInclude: boolean;
  isStartFrom: boolean;
  isStartFromEveryTerm: boolean;

  /**
   * Only ever true under {@link SegmentMatchMode.Fuzzy}, where it is the weakest tier of all.
   */
  isSubsequenceEveryTerm: boolean;

  item: Item;
}

/**
 * What {@link sortItems} needs to know about the picker's current state.
 */
export interface SortContext {
  /**
   * The relative path of the current folder's own folder note, which sorts directly below `..`. Empty when
   * the picker is at the vault root or the folder has no folder note.
   */
  readonly folderNoteRelativePath: string;

  /**
   * Recently-opened file paths mapped to their position in the recent list. Absent means never opened.
   */
  readonly lastOpenFileIndexMap: ReadonlyMap<string, number>;

  /**
   * How one query term is tested against one path part.
   */
  readonly segmentMatchMode: SegmentMatchMode;

  /**
   * Whether the updated-date ordering is on. When off, folders lead instead.
   */
  readonly shouldSortByUpdatedDate: boolean;
}

/**
 * The ranking tiers, most significant first.
 *
 * Order is the whole contract: an exact title match beats a prefix match, which beats a path match, which
 * beats the three all-terms-match tiers. Within a tier, folders lead — a folder is a place to navigate to
 * rather than a leaf, so offering it first costs a keystroke and saves a wrong pick.
 *
 * The last rung is reachable only under {@link SegmentMatchMode.Fuzzy}, and it is what keeps a scattered
 * hit from ever outranking a contiguous one: everything above it rests on equality, `startsWith` or
 * `includes`, all of which are strictly stronger than a subsequence and none of which the mode touches.
 * It also has to exist rather than merely widen the match test, because a shown item that satisfies no
 * tier would break the rule that an item ranks exactly when it is shown — and it would silently lose the
 * folders-lead tiebreak every other tier applies.
 */
const QUERY_RANK_TIERS: readonly ((queryItem: QueryItem) => boolean)[] = [
  (queryItem): boolean => queryItem.isExactMatch,
  (queryItem): boolean => queryItem.isStartFrom,
  (queryItem): boolean => queryItem.isPathInclude,
  (queryItem): boolean => queryItem.isEqualToEveryTerm,
  (queryItem): boolean => queryItem.isStartFromEveryTerm,
  (queryItem): boolean => queryItem.isIncludeEveryTerm,
  (queryItem): boolean => queryItem.isSubsequenceEveryTerm
];

/**
 * Computes one item's match facts against a query, ahead of ranking.
 *
 * @param params - The item, the raw query, and the per-term match rule.
 * @returns The item with its seven match facts.
 */
export function applyQuery(params: ApplyQueryParams): QueryItem {
  const item = params.item;
  const lowerCaseQuery = params.query.toLowerCase();
  const queryWithExtension = item.lowerCaseExtension ? `${lowerCaseQuery}.${item.lowerCaseExtension}` : lowerCaseQuery;
  const queryTerms = lowerCaseQuery.split(/[ /]/);

  const isIncludeEveryTerm = queryTerms.every((queryTerm) => item.lowerCasePathParts.some((pathPart) => pathPart.includes(queryTerm)));

  // A substring is also a subsequence, so under `Fuzzy` this holds for everything the tier above it holds for.
  // That is deliberate: the tier is what an otherwise unranked scattered hit lands in, not a way of separating the two.
  const isSubsequenceEveryTerm = params.mode === SegmentMatchMode.Fuzzy
    && queryTerms.every((queryTerm) => item.lowerCasePathParts.some((pathPart) => checkIsSubsequence(queryTerm, pathPart)));

  return {
    isEqualToEveryTerm: queryTerms.every((queryTerm) => item.lowerCasePathParts.includes(queryTerm)),
    isExactMatch: item.lowerCaseTitles.includes(lowerCaseQuery) || item.lowerCaseTitles.includes(queryWithExtension),
    isIncludeEveryTerm,

    // Matching and the weakest ranking tier are the same test — an item ranks at all exactly when it is shown at all. Computed once and shared so the two can never drift apart.
    isMatch: isIncludeEveryTerm || isSubsequenceEveryTerm,

    isPathInclude: lowerCaseQuery.includes('/') && item.lowerCaseRelativePath.includes(lowerCaseQuery),
    isStartFrom: item.lowerCaseTitles.some((title) => title.startsWith(lowerCaseQuery)),
    isStartFromEveryTerm: queryTerms.every((queryTerm) => item.lowerCasePathParts.some((pathPart) => pathPart.startsWith(queryTerm))),
    isSubsequenceEveryTerm,
    item
  };
}

/**
 * Fills an item's precomputed lower-case fields from its path and aliases.
 *
 * Separate from building the item because it needs one fact the item itself cannot answer — whether the
 * file is its folder's folder note — and that answer belongs to the vault, not to the model.
 *
 * @param item - The item to fill, mutated in place.
 * @param isFolderNote - Whether {@link Item.file} is the folder note of its parent folder. A folder note
 *   answers to its FOLDER's name rather than its own: `Foo/Foo.md` is how you reach `Foo`.
 */
export function fillLowerCaseFields(item: Item, isFolderNote: boolean): void {
  item.lowerCaseRelativePath = item.relativePath.toLowerCase();
  item.lowerCasePathParts = item.lowerCaseRelativePath.split('/');

  const name = item.file.name;
  const lastDotIndex = name.lastIndexOf('.');
  const hasExtension = !item.isFolder && lastDotIndex > 0;

  item.lowerCaseExtension = hasExtension ? name.slice(lastDotIndex + 1).toLowerCase() : '';
  item.lowerCaseTitles = [hasExtension && isFolderNote ? name.slice(0, lastDotIndex).toLowerCase() : name.toLowerCase()];

  for (const alias of item.aliases) {
    item.lowerCaseTitles.push(alias.toLowerCase());
    item.lowerCasePathParts.push(alias.toLowerCase());
  }
}

/**
 * Filters items to those matching the query, then orders them.
 *
 * @param items - Every candidate item.
 * @param query - The raw query. Empty shows everything, ordered by {@link SortContext} alone.
 * @param sortContext - The picker's current state.
 * @returns The matching items, best first.
 */
export function sortItems(items: readonly Item[], query: string, sortContext: SortContext): Item[] {
  return items
    .map((item) => applyQuery({ item, mode: sortContext.segmentMatchMode, query }))
    .filter((queryItem) => queryItem.isMatch)
    .sort((a, b) => compareQueryItems(a, b, query, sortContext))
    .map((queryItem) => queryItem.item);
}

/**
 * Whether a term's characters appear inside a path part in order, contiguously or not.
 *
 * @param term - The query term, already lower-cased.
 * @param pathPart - The path part, already lower-cased.
 * @returns `true` when every character was found, each after the one before it.
 */
function checkIsSubsequence(term: string, pathPart: string): boolean {
  let searchFromIndex = 0;

  for (const character of term) {
    const foundIndex = pathPart.indexOf(character, searchFromIndex);

    if (foundIndex === -1) {
      return false;
    }

    searchFromIndex = foundIndex + 1;
  }

  return true;
}

function compareByFileProperties(a: QueryItem, b: QueryItem, query: string, sortContext: SortContext): number {
  // `..` and the current folder's own note are navigation, not results — they hold the top two rows regardless of query, so drilling out never requires scrolling.
  const parentSort = rankFirst(a, b, (queryItem) => queryItem.item.relativePath === PARENT_RELATIVE_PATH);
  if (parentSort !== 0) {
    return parentSort;
  }

  if (sortContext.folderNoteRelativePath) {
    const folderNoteSort = rankFirst(a, b, (queryItem) => queryItem.item.relativePath === sortContext.folderNoteRelativePath);
    if (folderNoteSort !== 0) {
      return folderNoteSort;
    }
  }

  if (sortContext.shouldSortByUpdatedDate) {
    const lastOpenSort = getLastOpenIndex(a, sortContext) - getLastOpenIndex(b, sortContext);
    if (lastOpenSort !== 0) {
      return lastOpenSort;
    }

    // Only with no query: once the user has typed, what they typed outranks how recently anything changed.
    if (!query) {
      const updatedSort = b.item.updated.localeCompare(a.item.updated);
      if (updatedSort !== 0) {
        return updatedSort;
      }
    }
  } else if (!query) {
    const folderSort = rankFirst(a, b, (queryItem) => queryItem.item.isFolder);
    if (folderSort !== 0) {
      return folderSort;
    }
  }

  // Shallower paths first, so a folder's own contents outrank anything pulled in from its subfolders.
  const depthSort = countSlashes(a.item.relativePath) - countSlashes(b.item.relativePath);
  if (depthSort !== 0) {
    return depthSort;
  }

  const pathSort = a.item.relativePath.localeCompare(b.item.relativePath);
  if (pathSort !== 0) {
    return pathSort;
  }

  return (a.item.aliases[0] ?? '').localeCompare(b.item.aliases[0] ?? '');
}

function compareByQueryTiers(a: QueryItem, b: QueryItem): number {
  for (const tier of QUERY_RANK_TIERS) {
    const tierSort = rankFirst(a, b, tier);
    if (tierSort !== 0) {
      return tierSort;
    }

    if (tier(a)) {
      const folderSort = rankFirst(a, b, (queryItem) => queryItem.item.isFolder);
      if (folderSort !== 0) {
        return folderSort;
      }
    }
  }

  return 0;
}

function compareQueryItems(a: QueryItem, b: QueryItem, query: string, sortContext: SortContext): number {
  if (query) {
    const querySort = compareByQueryTiers(a, b);
    if (querySort !== 0) {
      return querySort;
    }
  }

  return compareByFileProperties(a, b, query, sortContext);
}

function countSlashes(path: string): number {
  return (path.match(/\//g) ?? []).length;
}

function getLastOpenIndex(queryItem: QueryItem, sortContext: SortContext): number {
  return sortContext.lastOpenFileIndexMap.get(queryItem.item.file.path) ?? NEVER_OPENED_INDEX;
}

/**
 * Orders the item satisfying `checkItem` ahead of the one that does not.
 */
function rankFirst(a: QueryItem, b: QueryItem, checkItem: (queryItem: QueryItem) => boolean): number {
  return Number(checkItem(b)) - Number(checkItem(a));
}

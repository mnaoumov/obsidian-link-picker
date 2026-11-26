/**
 * @file
 *
 * Finds a picker trigger typed before the caret.
 *
 * Adapted from `Note Compass` (`src/mentions/trigger.ts`, https://github.com/carlesba/obsidian-note-compass, commit
 * e32565382f3a4f7124c924a5152c8c252565d71b), under its MIT license:
 *
 * MIT License
 *
 * Copyright (c) 2026 Carles Ballester
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * A trigger found before the caret.
 *
 * @typeParam T - The trigger's owner.
 */
export interface TriggerMatch<T extends TriggerOwner> {
  /**
   * The owner of the trigger that matched.
   */
  readonly owner: T;

  /**
   * What was typed after the trigger, up to the caret.
   */
  readonly query: string;

  /**
   * Where the trigger starts in the line.
   */
  readonly start: number;
}

/**
 * Anything that owns a trigger string.
 */
export interface TriggerOwner {
  readonly trigger: string;
}

const WHITESPACE_REG_EXP = /\s/;
const CODE_FENCE_REG_EXP = /^\s*(?:```|~~~)/;
const FRONTMATTER_FENCE = '---';

/**
 * Fences and backticks open and close in pairs, so an odd count means one is still open.
 */
const PAIR_SIZE = 2;

/**
 * Finds the trigger the caret is typing after.
 *
 * The longest trigger that matches wins, so `@@` beats `@` on `@@ada`, and of two identical ones the first. Every match
 * starts at the same place: a match needs whitespace or the line start before it and none after it, so a second one
 * further right would have to start inside the first match's run of non-whitespace. That is why the original's
 * closest-to-the-caret comparison is gone, along with the whitespace a trigger may not contain.
 *
 * @param lineBeforeCaret - The caret's line, up to the caret.
 * @param owners - The candidates. One with an empty trigger never matches.
 * @returns The match, or `null` when the caret is not typing after any trigger.
 */
export function findTrigger<T extends TriggerOwner>(lineBeforeCaret: string, owners: readonly T[]): null | TriggerMatch<T> {
  let longest: null | TriggerMatch<T> = null;

  for (const owner of owners) {
    const match = matchTrigger(lineBeforeCaret, owner);

    if (!match) {
      continue;
    }

    if (!longest || owner.trigger.length > longest.owner.trigger.length) {
      longest = match;
    }
  }

  return longest;
}

/**
 * Tells whether the caret is somewhere a trigger must stay plain text: frontmatter, a fenced code block, or an inline
 * code span on its own line.
 *
 * @param linesAbove - Every line above the caret's.
 * @param lineBeforeCaret - The caret's line, up to the caret.
 * @returns Whether the caret is in code or frontmatter.
 */
export function isInCodeOrFrontmatter(linesAbove: readonly string[], lineBeforeCaret: string): boolean {
  if (isInFrontmatter(linesAbove)) {
    return true;
  }

  const fenceCount = linesAbove.filter((line) => CODE_FENCE_REG_EXP.test(line)).length;

  if (isOdd(fenceCount)) {
    return true;
  }

  const backtickCount = lineBeforeCaret.split('`').length - 1;
  return isOdd(backtickCount);
}

function isInFrontmatter(linesAbove: readonly string[]): boolean {
  return linesAbove[0]?.trim() === FRONTMATTER_FENCE && linesAbove.slice(1).every((line) => line.trim() !== FRONTMATTER_FENCE);
}

function isOdd(count: number): boolean {
  return count % PAIR_SIZE === 1;
}

function matchTrigger<T extends TriggerOwner>(lineBeforeCaret: string, owner: T): null | TriggerMatch<T> {
  if (!owner.trigger) {
    return null;
  }

  const start = lineBeforeCaret.lastIndexOf(owner.trigger);

  if (start === -1) {
    return null;
  }

  const query = lineBeforeCaret.slice(start + owner.trigger.length);

  // A space ends the trigger: what follows is ordinary text, and the trigger stays as typed.
  if (WHITESPACE_REG_EXP.test(query)) {
    return null;
  }

  const charBefore = lineBeforeCaret.charAt(start - 1);

  // Only at the start of a line or after whitespace, so an e-mail address never opens a picker.
  return charBefore && !WHITESPACE_REG_EXP.test(charBefore) ? null : { owner, query, start };
}

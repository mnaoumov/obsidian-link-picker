import {
  describe,
  expect,
  it
} from 'vitest';

import {
  findTrigger,
  isInCodeOrFrontmatter
} from './trigger.ts';

const AT = { trigger: '@' };
const DOUBLE_AT = { trigger: '@@' };
const NONE = { trigger: '' };

describe('findTrigger', () => {
  it('should match a trigger at the start of the line, with what follows as the query', () => {
    expect(findTrigger('@ada', [AT])).toEqual({ owner: AT, query: 'ada', start: 0 });
  });

  it('should match a trigger typed just now, with an empty query', () => {
    expect(findTrigger('Met @', [AT])).toEqual({ owner: AT, query: '', start: 4 });
  });

  it('should match after a tab as well as a space', () => {
    expect(findTrigger('\t@ada', [AT])?.start).toBe(1);
  });

  it('should not match inside a word, so an e-mail address stays plain text', () => {
    expect(findTrigger('ada@example', [AT])).toBeNull();
  });

  it('should not match once a space follows the trigger, which keeps it as plain text', () => {
    expect(findTrigger('@ada ', [AT])).toBeNull();
    expect(findTrigger('@ ', [AT])).toBeNull();
  });

  it('should not match a line with no trigger', () => {
    expect(findTrigger('Met Ada', [AT])).toBeNull();
  });

  it('should never match an empty trigger', () => {
    expect(findTrigger('anything', [NONE])).toBeNull();
  });

  it('should let the longer trigger win where both start at the same place', () => {
    expect(findTrigger('@@ada', [AT, DOUBLE_AT])?.owner).toBe(DOUBLE_AT);
    expect(findTrigger('@@ada', [DOUBLE_AT, AT])?.owner).toBe(DOUBLE_AT);
  });

  it('should keep the shorter trigger where the longer one is not typed', () => {
    expect(findTrigger('@ada', [DOUBLE_AT, AT])?.owner).toBe(AT);
  });

  it('should match only the trigger the caret is still typing after', () => {
    const hash = { trigger: '#p' };

    expect(findTrigger('@ada #pa', [AT, hash])).toEqual({ owner: hash, query: 'a', start: 5 });
    expect(findTrigger('#pa @ad', [hash, AT])).toEqual({ owner: AT, query: 'ad', start: 4 });
  });

  it('should keep the first owner of two identical triggers', () => {
    const other = { trigger: '@' };

    expect(findTrigger('@ada', [AT, other])?.owner).toBe(AT);
  });
});

describe('isInCodeOrFrontmatter', () => {
  it('should be false in ordinary text', () => {
    expect(isInCodeOrFrontmatter(['# Title', ''], 'Met @')).toBe(false);
  });

  it('should be true inside frontmatter that has not closed yet', () => {
    expect(isInCodeOrFrontmatter(['---', 'person: '], 'x: @')).toBe(true);
  });

  it('should be false below frontmatter that has closed', () => {
    expect(isInCodeOrFrontmatter(['---', 'a: 1', '---'], '@')).toBe(false);
  });

  it('should be false when a later --- line is not opening frontmatter', () => {
    expect(isInCodeOrFrontmatter(['text', '---'], '@')).toBe(false);
  });

  it('should be true inside an open fenced code block of either kind', () => {
    expect(isInCodeOrFrontmatter(['```ts'], '@')).toBe(true);
    expect(isInCodeOrFrontmatter(['  ~~~'], '@')).toBe(true);
  });

  it('should be false after a fenced code block has closed', () => {
    expect(isInCodeOrFrontmatter(['```', 'code', '```'], '@')).toBe(false);
  });

  it('should be true inside an open inline code span, and false after it closes', () => {
    expect(isInCodeOrFrontmatter([], 'Run `@')).toBe(true);
    expect(isInCodeOrFrontmatter([], 'Run `x` @')).toBe(false);
  });
});

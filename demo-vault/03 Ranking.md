# Ranking

Obsidian's own suggester is fuzzy: it scores how well a name resembles what you typed, and the score moves as the vault changes. This picker sorts into fixed tiers instead. The same query puts the same note first today and next month, so the keystrokes you learn keep working.

## Try it

```code-button
---
caption: Open a scratch note to insert links into
---
await require('/demoSetup.ts').openScratchNote(app);
```

Manual equivalent: open any note and click into its text.

Run **Link Picker: Insert link...**, navigate into `Materials`, then `03 Ranking`, and type `court`.

The four notes come back in three groups:

1. [Court](<./Materials/03 Ranking/Court.md>) — the title IS the query.
2. [Court of Appeal](<./Materials/03 Ranking/Court of Appeal.md>) and [Courtyard](<./Materials/03 Ranking/Courtyard.md>) — the title starts with it.
3. [District court records](<./Materials/03 Ranking/District court records.md>) — the title merely contains it.

The groups never trade places. Which of the two middle notes leads depends on the tie-breakers below — by default the one changed more recently — and turning **By date** off swaps that for a plain path ordering, which puts `Court of Appeal` first.

## The tiers

A row is shown exactly when it ranks at all, and it is ranked by the first of these it satisfies:

- exact match
  - the title, or one of its aliases, is the query.
- starts with
  - the title starts with the query.
- path contains
  - the whole relative path contains the query, which is what makes `Legal/Court` reachable by typing `legal/co`.
- every term matches exactly
  - the query split on spaces, each term equal to some title or path part.
- every term is a prefix
  - each term starts one.
- every term appears
  - each term is contained somewhere.

Within a tier, folders lead — a folder is a place to go rather than a leaf, so offering it first costs a keystroke and saves a wrong pick.

## Breaking ties

When two rows land in the same tier, the order is decided in turn by: the folder note of the folder you are in, then how recently each note was opened, then the updated date, then how deep the path is, then the path itself, then the alias.

The updated date is read from a frontmatter property when the vault has one — see `updatedPropertyName` in [05 Settings](<./05 Settings.md>) — and falls back to the file's modification time, which every vault has. The **By date** control turns that ordering off.

## Where next

- [04 Named pickers](<./04 Named pickers.md>) — a picker per folder, so the query has less to disambiguate.

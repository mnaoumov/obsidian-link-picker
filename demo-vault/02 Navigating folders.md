# Navigating folders

Choosing a folder in the picker does not link to it — it opens it. That is the whole difference from typing `[[`: you narrow by where a note lives, not by hoping its name is distinctive.

## Try it

```code-button
---
caption: Open a scratch note to insert links into
---
await require('/demoSetup.ts').openScratchNote(app);
```

Manual equivalent: open any note and click into its text.

Run **Link Picker: Insert link...**, then:

1. Type `Legal` and press `Enter`. The picker reopens rooted inside [Legal](<./Materials/02 Navigating folders/Legal/Legal.md>) — the rows are now that folder's own contents: [Retainer](<./Materials/02 Navigating folders/Legal/Retainer.md>) and the two subfolders.
2. The first row is `..`. Press `Enter` on it and you are back where you were.
3. Go back into `Legal`, then into `Courts`, and pick [Supreme Court](<./Materials/02 Navigating folders/Legal/Courts/Supreme Court.md>).

The other subfolder, `Filings`, holds [Statement of claim](<./Materials/02 Navigating folders/Legal/Filings/Statement of claim.md>), and `Courts` also holds [District Court](<./Materials/02 Navigating folders/Legal/Courts/District Court.md>) — so both folders have something to choose between.

The `..` row is pinned to the top and is not something you can type your way to — it is a way out, not a name.

## The four view toggles

The instruction bar along the bottom of the picker lists them, and each says what it would do next rather than what it just did.

- `Alt + 2`
  - shows files that are not notes. Hidden by default, because a PDF is not something you link to by name.
- `Alt + 3`
  - reaches into subfolders. With it on, `Legal` offers `Courts/Supreme Court.md` without your navigating in.
- `Alt + 4`
  - hides everything that is not a folder, so a deep folder can be reached without reading past the notes on the way. The `..` row survives it — a mode you cannot leave would be a trap.
- `Alt + 5`
  - stops leading with the most recently updated note, falling back to a plain path ordering.

`Alt + 2` and `Alt + 3` are ignored while `Alt + 4` is on, because between them they would empty the list.

## Folder notes

`Legal` has a folder note — `Legal.md`, the note that describes the folder itself. The picker knows about it, and it comes from the **Folder Notes** plugin's own configuration rather than from a convention this plugin invents, so a vault that already has folder notes needs no setting here at all.

The folder note is not offered under its own file name. `Legal/Legal.md` says nothing that `Legal` did not already say, and the folder row is how you reach it.

## Where next

- [03 Ranking](<./03 Ranking.md>) — the order the rows come back in.
- [04 Named pickers](<./04 Named pickers.md>) — how to start inside `Legal` without navigating there every time.

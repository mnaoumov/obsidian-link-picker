# Start here

This is an [Obsidian](https://obsidian.md/) vault that documents the [Link Picker](https://github.com/mnaoumov/obsidian-link-picker/) plugin by demonstrating it.

Typing `[[` searches your whole vault at once. In a vault where the same word appears in twenty places, that is the wrong question: you do not want every note called `Court`, you want the one under `Legal/Courts`. And because the search is fuzzy, the note that came first last time need not come first this time, so the keystrokes you learned stop working.

This plugin picks a note the way a file dialog does — you point it at a folder and navigate. Its ranking is deterministic rather than fuzzy, so the same query puts the same note first every time. It can also be preconfigured: one command per folder you link into often.

## Your first minute

The notes here are driven by **code buttons** — captioned rectangles like the one below. Clicking one runs the TypeScript inside it and shows the result underneath; the `</>` toggle beside the caption reveals that source. Nothing runs until you click.

```code-button
---
caption: Open a scratch note to insert links into
---
await require('/demoSetup.ts').openScratchNote(app);
```

Manual equivalent: open any note and click into its text.

1. Press the button above. It opens `Scratch.md` in edit mode, because the picker writes at the cursor and a note in reading view has none.
2. Open the Command Palette and run **Link Picker: Insert link...**.
3. Type `People` and press `Enter`. The picker does not link to the folder — it opens it.
4. Type `Ada` and press `Enter`. A link to `Ada Lovelace` lands where your cursor was.

That is the whole idea. The notes below take it apart.

## Features

| Note | What it covers |
| --- | --- |
| [01 Picking a link](<./01 Picking a link.md>) | the command, the picker, and what comes back |
| [02 Navigating folders](<./02 Navigating folders.md>) | drilling in and out, and the four view toggles |
| [03 Ranking](<./03 Ranking.md>) | why the same query always puts the same note first |
| [04 Named pickers](<./04 Named pickers.md>) | one preconfigured command per folder you link into |
| [05 Settings](<./05 Settings.md>) | every setting, by the key it is stored under |

## Materials

`Materials/` holds what the walkthroughs pick from: a `People` folder with aliased notes, a nested `Legal` tree with a folder note, and four notes named to make the ranking visible.

When you are finished, this puts the vault back as you found it:

```code-button
---
caption: Remove the scratch note and the demo picker
---
await require('/demoSetup.ts').resetDemo(app);
```

Manual equivalent: delete `Scratch.md`, and delete the picker in **Settings → Link Picker**.

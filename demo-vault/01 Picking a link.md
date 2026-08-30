# Picking a link

The **Insert link...** command opens the picker over the whole vault. What you choose is written at the cursor as a link, replacing whatever was selected.

## Try it

The picker writes at a cursor, so it needs a note being edited rather than read:

```code-button
---
caption: Open a scratch note to insert links into
---
await require('/demoSetup.ts').openScratchNote(app);
```

Manual equivalent: open any note and click into its text.

Now run **Link Picker: Insert link...** from the Command Palette, type `Ada`, and press `Enter`.

## What comes back

[Ada Lovelace](<./Materials/01 Picking a link/People/Ada Lovelace.md>) carries two aliases in its frontmatter, so the picker offers it three times: once under its file name, and once under each alias. They are different rows because they produce different links — picking the `Ada` row writes a link labelled `Ada`, not one labelled `Ada Lovelace.md`.

[Grace Hopper](<./Materials/01 Picking a link/People/Grace Hopper.md>) has one alias and is therefore offered twice; [Alan Turing](<./Materials/01 Picking a link/People/Alan Turing.md>) has none and is offered once.

The result is a **string**, and where it goes is up to whoever asked for it. The command puts it at the cursor. A picker configured with an inline field (see [04 Named pickers](<./04 Named pickers.md>)) prefixes it, so it drops straight into a note's property list instead:

```markdown
Person: [[Ada Lovelace|Ada]]
```

## Selecting a note that does not exist yet

Type a name nothing matches and press `Shift + Enter`. The note is created in the folder the picker is currently rooted at, and linked in the same gesture.

The note is created **empty**. Templates, frontmatter and naming conventions are vault policy, not this plugin's — a caller that has such conventions supplies them through the API rather than settling for a blank note.

## Declining a link

`Alt + 1` closes the picker and inserts nothing. That is different from pressing `Escape`, which dismisses the picker as a mistake — declining is a real answer, and a template that asks for an optional link needs it.

## Where next

- [02 Navigating folders](<./02 Navigating folders.md>) — how to reach a note without typing its path.
- [03 Ranking](<./03 Ranking.md>) — why `Ada` always puts the same row first.

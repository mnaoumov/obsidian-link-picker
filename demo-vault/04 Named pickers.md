# Named pickers

If you link into `People` twenty times a day, navigating there twenty times is the wrong shape. A named picker is that navigation done once, in settings: it becomes its own command, already rooted where you wanted to be.

## Try it

```code-button
---
caption: Add an "Insert person" picker scoped to the People folder
---
await require('/demoSetup.ts').addPersonPicker(app);
```

Manual equivalent: open **Settings → `Link Picker`**, press `+` beside **Pickers**, and fill the page in — name `Insert person`, trigger `@`, folder `Materials/01 Picking a link/People`, prefix `"Person: "`.

```code-button
---
caption: Open a scratch note to insert links into
---
await require('/demoSetup.ts').openScratchNote(app);
```

Manual equivalent: open any note and click into its text.

Now open the Command Palette. Alongside **`Link Picker`: Insert link...** there is **`Link Picker`: Insert person**. Run it: the picker opens already inside `People`, with `Who?` as its placeholder, and what it writes is prefixed:

```markdown
Person: [[Ada Lovelace|Ada]]
```

That prefix is the `prefix` setting — a plain string, not a field name, so `"Person: "` gives you `Dataview`'s inline-field shape while `"- "` or `"` give you something else entirely. A `suffix` closes the pair when you need one.

## Typing a trigger

The picker also has a trigger, `@`, so it opens without the Command Palette, which is the long way round on a phone. In the scratch note, type `@ada`. A one-row suggestion appears, `Insert person` with `Search for "ada"` under it. Press `Enter`, or tap the row, and the picker opens inside `People` with `ada` already typed. Pick `Ada Lovelace`, and `@ada` becomes:

```markdown
Person: [[Ada Lovelace|Ada]]
```

A trigger stays plain text whenever you did not mean it:

- it counts only at the start of a line or after a space, so `ada@example.com` is left alone;
- it never counts inside frontmatter, a fenced code block or an inline code span;
- typing a space after it, or pressing `Escape`, keeps what you typed exactly as typed;
- dismissing the picker it opened leaves the text alone too.

Each trigger belongs to one picker. Two pickers may have triggers where one starts with the other, such as `@` and `@@`, and then the longer one wins as you type it.

## What a picker holds

Each picker is a page under **Pickers** in the settings tab, with the native `+`, delete and drag-to-reorder affordances beside the list.

- `name`
  - what its command is called. Two pickers cannot share one.
- `trigger`
  - what you type in a note to be offered the picker, such as `@`. Empty means the command alone opens it. Two pickers cannot share one, and it cannot contain a space.
- `folderPath`
  - where it opens. A starting point, not a fence — `..` still navigates out of it.
- `includeSubfolders`
  - whether it starts with subfolder contents included. `Alt + 3` still toggles it.
- `prefix`
  - emitted immediately before the link. `"Person: "` is what produces the property-list shape above.
- `suffix`
  - emitted immediately after the link.
- `shouldApplyPrefixSuffixWhenNoLinkSelected`
  - whether the prefix and suffix are still emitted when you press **No link**. Off by default, so declining writes nothing at all rather than a `"Person: "` with nothing after it.
- `shouldUseSelectionAsDisplayText`
  - whether the text you selected before running the command is kept as the link's display text — select `the countess`, pick `Ada Lovelace`, get `[[Ada Lovelace|the countess]]` — rather than replaced by the link. Off by default. The selection seeds the query either way.
- `placeholder`
  - the picker's placeholder text.
- `shouldAllowCreate`
  - whether `Shift + Enter` offers to create a note that does not exist.

## Renaming keeps your hotkey

A picker's command is identified by an id minted when the picker is created, not by its name. Bind `Insert person` to a hotkey, rename it to `Insert human`, and the hotkey still works — the command's name changed, its identity did not.

## What settings cannot express

Anything richer than those six fields is code, not configuration: validating a name, routing a new note to a folder derived from it, seeding frontmatter from a template. That is what the plugin's API is for, and a caller with such conventions supplies them there.

[06 Calling it from a script](<./06 Calling it from a script.md>) shows that API in use.

## Putting it back

```code-button
---
caption: Remove the scratch note and the demo picker
---
await require('/demoSetup.ts').resetDemo(app);
```

Manual equivalent: delete `Scratch.md`, and delete the picker in **Settings → `Link Picker`**.

## Where next

- [05 Settings](<./05 Settings.md>) — every setting, by the key it is stored under.

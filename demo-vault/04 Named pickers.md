# Named pickers

If you link into `People` twenty times a day, navigating there twenty times is the wrong shape. A named picker is that navigation done once, in settings: it becomes its own command, already rooted where you wanted to be.

## Try it

```code-button
---
caption: Add an "Insert person" picker scoped to the People folder
---
await require('/demoSetup.ts').addPersonPicker(app);
```

Manual equivalent: open **Settings → Link Picker**, press `+` beside **Pickers**, and fill the page in — name `Insert person`, folder `Materials/01 Picking a link/People`, prefix `"Person: "`.

```code-button
---
caption: Open a scratch note to insert links into
---
await require('/demoSetup.ts').openScratchNote(app);
```

Manual equivalent: open any note and click into its text.

Now open the Command Palette. Alongside **Link Picker: Insert link...** there is **Link Picker: Insert person**. Run it: the picker opens already inside `People`, with `Who?` as its placeholder, and what it writes is prefixed:

```markdown
Person: [[Ada Lovelace|Ada]]
```

That prefix is the `prefix` setting — a plain string, not a field name, so `"Person: "` gives you Dataview's inline-field shape while `"- "` or `"` give you something else entirely. A `suffix` closes the pair when you need one.

## What a picker holds

Each picker is a page under **Pickers** in the settings tab, with the native `+`, delete and drag-to-reorder affordances beside the list.

- `name`
  - what its command is called. Two pickers cannot share one.
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
- `placeholder`
  - the picker's placeholder text.
- `shouldAllowCreate`
  - whether `Shift + Enter` offers to create a note that does not exist.

## Renaming keeps your hotkey

A picker's command is identified by an id minted when the picker is created, not by its name. Bind `Insert person` to a hotkey, rename it to `Insert human`, and the hotkey still works — the command's name changed, its identity did not.

## What settings cannot express

Anything richer than those six fields is code, not configuration: validating a name, routing a new note to a folder derived from it, seeding frontmatter from a template. That is what the plugin's API is for, and a caller with such conventions supplies them there.

The API is not published yet — it is waiting on a cross-plugin API registry being built in `obsidian-dev-utils`. This note will grow a section when it lands.

## Putting it back

```code-button
---
caption: Remove the scratch note and the demo picker
---
await require('/demoSetup.ts').resetDemo(app);
```

Manual equivalent: delete `Scratch.md`, and delete the picker in **Settings → Link Picker**.

## Where next

- [05 Settings](<./05 Settings.md>) — every setting, by the key it is stored under.

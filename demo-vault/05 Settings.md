# Settings

Every setting the plugin stores, named by the key it appears under in `data.json` rather than by its label in the settings tab — that key is what you see in a sync conflict, a support thread, or the file itself.

## Folder notes

- `folderNoteLocation`
  - where a folder's folder note lives. `Auto` — the default — reads the installed **Folder Notes** plugin's own configuration, so a vault that already has folder notes needs nothing here. The alternatives are `InsideFolder`, `ParentFolder`, and `None` for a vault that has no folder notes at all.
- `folderNoteName`
  - the folder note's name, without extension, when `folderNoteLocation` is not `Auto`. Empty names it after its folder.

## Scope

- `excludedPathPatterns`
  - paths containing any of these are hidden from the picker. Substrings, not patterns — the case this exists for is a vault-wide attachment folder, and a substring says that in one line without a pattern language to learn.

## Ordering and labels

- `updatedPropertyName`
  - the frontmatter property holding a note's last-updated timestamp, used by the sort-by-updated ordering. Empty falls back to the file's modification time, which every vault has.
- `titlePropertyName`
  - the frontmatter property holding a note's display title, used as the alias of a note the picker creates. Empty falls back to the file name.

## Pickers

- `pickers`
  - the configured pickers, each of which becomes its own command. See [04 Named pickers](<./04 Named pickers.md>) for what one holds and how it is edited.

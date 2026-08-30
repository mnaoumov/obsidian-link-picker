# Link Picker

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov) [![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-link-picker)](https://github.com/mnaoumov/obsidian-link-picker/releases) [![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-link-picker/total)](https://github.com/mnaoumov/obsidian-link-picker/releases) [![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-link-picker)

Obsidian's own link autocomplete searches the whole vault and ranks it fuzzily, which is exactly wrong when you know the link belongs in one folder and you want the same note to come first every time. This plugin is a link picker you can point at a folder and then **navigate** — pick a folder to descend into it, pick `..` to come back out — with a ranking that is deterministic rather than fuzzy: an exact name beats a prefix, which beats a path match, which beats a scattered word match.

It is also callable. The picker returns a **string**, so a template or a script can ask for a link and drop the answer straight into a property value.

## Demo vault

**The documentation is a demo vault.** Every feature has a note that explains what it does and how to try it.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **Link Picker: Open demo vault** command.
2. Downloading `link-picker-demo-vault-<version>.zip` (`<version>` is the release version) from the [Releases](https://github.com/mnaoumov/obsidian-link-picker/releases).
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## Picking a link

Run **Link Picker: Insert link...** in an editor. Any selected text seeds the query and is replaced by the link you choose.

Inside the picker:

| Key | What it does |
| --- | --- |
| `Enter` on a folder | Descend into that folder |
| `Enter` on `..` | Go back up |
| `Alt + 1` | Choose nothing, and insert an empty link |
| `Alt + 2` | Show all files, not only markdown |
| `Alt + 3` | Include or exclude subfolder contents |
| `Alt + 4` | Show only folders |
| `Alt + 5` | Sort by updated date, or not |
| `Shift + Enter` | Create a note with the name you typed, and link to it |

## Ranking

With a query typed, items are ranked in tiers, and only within a tier does anything else break the tie:

1. The name matches exactly
2. The name starts with the query
3. The path contains the query (only when the query itself contains a `/`)
4. Every query term equals some part of the path
5. Every query term starts some part of the path
6. Every query term appears somewhere in the path

Aliases count as names, so a note with three aliases offers three rows that rank separately. Inside a tier, folders come first; then recently opened files, then updated date, then shallower paths, then alphabetical.

With no query typed, `..` and the current folder's own folder note hold the top two rows, so navigating out never means scrolling.

## Folder notes

The picker understands folder notes: choosing a folder in a link position links to that folder's note, and the folder's name becomes the alias rather than the note's own (`Foo/Foo.md` reads as `Foo`).

Where that note lives is read from the installed [`folder-notes`](https://github.com/LostPaul/obsidian-folder-notes) plugin by default, so a vault that already has folder notes needs no configuration. `Folder note location` in the settings overrides it.

## Settings

- **Folder note location** — `Auto` (read the `folder-notes` plugin), inside the folder, beside the folder, or none.
- **Folder note name** — what the note is called, when not on `Auto`.
- **Excluded paths** — substrings; a path containing any of them is hidden. Point this at your attachment folder.
- **Updated property** — the frontmatter property holding a note's last-updated timestamp, used by the sort-by-updated ordering. Empty falls back to the file's modification time.
- **Title property** — the frontmatter property holding a note's display title, used as the alias of a note the picker creates. Empty falls back to the file name.

## Installation

The plugin is not yet available in the official Community Plugins repository.

### Beta versions

To install the latest beta release of this plugin (BRAT -> `Add Beta plugin` -> specify this repository -> `Enable after installing the plugin`):

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)
2. Run the command `Obsidian42 - BRAT: Add a beta plugin for testing`
3. Enter `https://github.com/mnaoumov/obsidian-link-picker`
4. Click `Add Plugin`

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command:

```js
window.DEBUG.enable('link-picker');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-dev-utils/guides/debugging/).

## Changelog

See [CHANGELOG](./CHANGELOG.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)

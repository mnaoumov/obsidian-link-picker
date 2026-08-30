# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Link Picker is a folder-scoped, deterministically ranked note picker for Obsidian. It ships two faces deliberately:

- an **`Insert link...` editor command**, the user-facing half;
- a **callable API returning a string**, which is where the plugin came from — it is an extraction of a 568-line script (`LinkSuggester.ts`) in the author's personal vault whose 17 consumers are all Templater templates writing `<field>: <link>` into a note's properties. Tracked as `T648-P44`.

A command-only plugin would serve none of those consumers, which is why the API is not an afterthought.

## Architecture

- `src/item.ts` — **pure**. The item model, `applyQuery`, and the whole six-tier ranking. No Obsidian API beyond the `TAbstractFile` type, so it is unit-tested directly; `src/item.test.ts` is the regression net for ranking behavior.
- `src/link-picker-modal.ts` — the `SuggestModal`. Folder navigation, the hotkeys, item construction from the vault.
- `src/select.ts` — `select(params)` plus the two option shapes: `SelectOptions` (public, mostly optional) and `SelectParams` (every default resolved — what the modal reads).
- `src/link-picker-component.ts` — resolves `SelectOptions` into `SelectParams` from the plugin settings, and owns the minimal built-in `createNote`.
- `src/command-handlers/` — the editor command.

## Deviations from the standard plugin architecture

The workspace convention is that all plugins share the same architecture; intentional deviations are documented here.

- **No `pluginNoticeComponent` use in the picker path.** Dismissing the picker rejects, and that is the user declining rather than a failure, so it produces no notice — see `insert-link-editor-command-handler.ts`.

## Things that are easy to get wrong

- **Folder notes are ODU's, not ours.** Every folder-note question goes through `resolveFolderNote` / `resolveFolderNoteConfig` from `obsidian-dev-utils/obsidian/folder-note`, which reads the installed `folder-notes` plugin's live configuration. Do not reintroduce a hardcoded name — the original script hardcoded `!.md` in five places, and removing that was most of the extraction.
- **`isMatch` and `isIncludeEveryTerm` are the same test on purpose.** An item is shown exactly when it ranks at all. They are computed once and shared in `applyQuery` so they cannot drift.
- **`updated` is compared as a string.** A frontmatter timestamp is ISO; the `stat.mtime` fallback is zero-padded to 13 digits so both sort under one `localeCompare`.
- **Comments must be one sentence per line.** `lint:fix` capitalizes the first word of every comment LINE, so a wrapped sentence comes back with a capital in the middle of it.

## Pending

- The API is not published yet. It will go through `T677-P1`'s cross-plugin API registry in `obsidian-dev-utils` (`publishPluginApi` / `requirePluginApi`) rather than an ad-hoc `plugin.api` convention, so that face is blocked on T677 landing.
- Settings carry no named pickers yet — one command, not one per configured picker.
- The demo vault is a skeleton; it needs the folder drill-in and inline-field demonstrations (G104, G98).
- No integration tests yet (G97).

# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Link Picker is a folder-scoped, deterministically ranked note picker for Obsidian. It ships two faces deliberately:

- an **`Insert link...` editor command**, the user-facing half;
- a **callable API returning a string**, which is where the plugin came from — it is an extraction of a 568-line script (`LinkSuggester.ts`) in the author's personal vault whose 17 consumers are all Templater templates writing `<field>: <link>` into a note's properties. Tracked as `T648-P44`.

A command-only plugin would serve none of those consumers, which is why the API is not an afterthought.

## Architecture

- `src/item.ts` — **pure**. The item model, `applyQuery`, and the whole six-tier ranking. No Obsidian API beyond the `TAbstractFile` type, so it is unit-tested directly; `src/item.test.ts` is the regression net for ranking behavior.
- `src/link-picker-modal.ts` — the `SuggestModal`. Folder navigation, the control strip and the hotkeys behind it, item construction from the vault.
- `src/select.ts` — `select(params)` plus the two option shapes: `SelectOptions` (public, mostly optional) and `SelectParams` (every default resolved — what the modal reads).
- `src/link-picker-component.ts` — resolves `SelectOptions` into `SelectParams` from the plugin settings, and owns the minimal built-in `createNote`.
- `src/command-handlers/` — the editor command, which is the generic `Insert link...` when handed no picker and a configured picker's own command when handed one.
- `src/picker-commands-component.ts` — keeps one command registered per configured picker, disposing and re-registering the batch when the picker list changes.

## Deviations from the standard plugin architecture

The workspace convention is that all plugins share the same architecture; intentional deviations are documented here.

- **No `pluginNoticeComponent` use in the picker path.** Dismissing the picker rejects, and that is the user declining rather than a failure, so it produces no notice — see `insert-link-editor-command-handler.ts`.
- **The settings tab binds one array for six rows.** `bind` is keyed on a TOP-LEVEL settings property and a picker's fields are two levels down, so every picker row binds `pickers` itself and converts in both directions through `bindPickerProperty`. Bypassing `bind` would also bypass validation, the transformers and the debounced save.

## Things that are easy to get wrong

- **Folder navigation belongs in `selectSuggestion`, not `onChooseSuggestion`.** Obsidian closes the modal around `onChooseSuggestion`, and on MOBILE that close lands after anything the callback does — so re-opening from there, inline or on a later tick, just dismissed the picker. Navigating before the base class runs means the modal is never closed at all. It also keeps `isSelected` false while navigating, without which dismissing after a drill-in leaves the caller's promise pending forever.
- **The empty row is excluded by IDENTITY, not by type.** It is backed by the vault root, which is a folder, so a plain `isFolder` test sends `Alt + 1` navigating to the root instead of declining the link.
- **The vault root's path is `/`, not `''`.** Anything that assigns `folderPath` from a folder must normalize it, or the root reads as a folder with a parent and two characters to strip off every row.
- **Every hotkey handler returns `false`.** Obsidian types the character otherwise: unconsumed, `Alt + 3` also filters the list by `3`, and `Alt + 1` — which closes the picker — types into the note. `createNew` returns `true` in the one case where it deliberately declines the key.
- **The control strip is the picker's only affordance on mobile**, which is why it replaced Obsidian's instruction bar rather than joining it: an instruction bar can only name a key, and a phone has no `Alt` to press. Every control runs the same handler its hotkey does, so a behavior is never reachable one way and not the other.
- **The strip is built ONCE and only re-stated.** Rebuilding it per keystroke would replace an element the pointer may be about to click. `renderControls` builds, `refreshControls` sets pressed and disabled state, and an unavailable control is disabled rather than removed so the strip never reflows under a finger.
- **A control's `mousedown` calls `preventDefault`.** The picker filters as you type; a click that stole focus from the input would end a search mid-word.
- **Folder notes are ODU's, not ours.** Every folder-note question goes through `resolveFolderNote` / `resolveFolderNoteConfig` from `obsidian-dev-utils/obsidian/folder-note`, which reads the installed `folder-notes` plugin's live configuration. Do not reintroduce a hardcoded name — the original script hardcoded `!.md` in five places, and removing that was most of the extraction.
- **`isMatch` and `isIncludeEveryTerm` are the same test on purpose.** An item is shown exactly when it ranks at all. They are computed once and shared in `applyQuery` so they cannot drift.
- **`updated` is compared as a string.** A frontmatter timestamp is ISO; the `stat.mtime` fallback is zero-padded to 13 digits so both sort under one `localeCompare`.
- **Comments must be one sentence per line.** `lint:fix` capitalizes the first word of every comment LINE, so a wrapped sentence comes back with a capital in the middle of it.

## Testing

- **`npm run test:coverage` is a gate, and it is 100 %.** `npm test` alone passing means nothing about it.
- **The integration suites share ONE Obsidian**, so each ends by picking something rather than by walking away — a picker left open is the next suite's first `.prompt`.
- **Drive a behavior by CLICKING its control, so the suite can be cross-platform.** The harness sends keys through Electron's input API, which Android does not have, so a suite that presses a key can only ever run on desktop. `hotkeys.desktop.integration.test.ts` is the one that deliberately does: it exists to prove the key is CONSUMED, which no click and no mocked scope can show.
- **Do not dispatch synthetic `KeyboardEvent`s** to work around that: they are untrusted, Obsidian may ignore them, and a lint rule refuses them. Reach the state through the product's own affordances instead.

## Pending

- The API is not published yet. It will go through `T677-P1`'s cross-plugin API registry in `obsidian-dev-utils`, whose consumer surface is `watchPluginApi` returning a live ref (`ref.value` / `await ref.whenAvailable()`) — the earlier `requirePluginApi` was cut from that design. That face is blocked on T677 landing.
- The vault's own `LinkSuggester.ts` still carries the whole implementation; shrinking it to a shim over the published API is the last phase, and waits on the same thing.

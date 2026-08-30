# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Link Picker is a folder-scoped, deterministically ranked note picker for Obsidian. It ships two faces deliberately:

- an **`Insert link...` editor command**, the user-facing half;
- a **callable API returning a string**, which is where the plugin came from — it is an extraction of a 568-line script (`LinkSuggester.ts`) in the author's personal vault whose 17 consumers are all Templater templates writing `<field>: <link>` into a note's properties. The extraction is `T648-P44` (closed); publishing the API and shrinking that script to a shim is `T718-P44`.

A command-only plugin would serve none of those consumers, which is why the API is not an afterthought.

## Architecture

- `src/item.ts` — **pure**. The item model, `applyQuery`, and the whole six-tier ranking. No Obsidian API beyond the `TAbstractFile` type, so it is unit-tested directly; `src/item.test.ts` is the regression net for ranking behavior.
- `src/link-picker-modal.ts` — the `SuggestModal`. Folder navigation, the control strip and the hotkeys behind it, item construction from the vault.
- `src/select.ts` — `select(params)` plus the two option shapes: `SelectOptions` (public, everything optional) and `SelectParams` (every default resolved — what the modal reads).
- `src/link-picker-api.ts` — the whole published surface in one file: the contract version, the zod contract, and `LinkPickerApi`, which delegates to `LinkPickerComponent`. `plugin.ts` publishes it with ODU's `publishPluginApi`.
- `src/link-picker-component.ts` — resolves `SelectOptions` into `SelectParams` from the plugin settings, and owns the minimal built-in `createNote`.
- `src/command-handlers/` — the editor command, which is the generic `Insert link...` when handed no picker and a configured picker's own command when handed one.
- `src/picker-commands-component.ts` — keeps one command registered per configured picker, disposing and re-registering the batch when the picker list changes.

## Deviations from the standard plugin architecture

The workspace convention is that all plugins share the same architecture; intentional deviations are documented here.

- **No `pluginNoticeComponent` use in the picker path.** Dismissing the picker rejects, and that is the user declining rather than a failure, so it produces no notice — see `insert-link-editor-command-handler.ts`.
- **The settings tab binds one array for six rows.** `bind` is keyed on a TOP-LEVEL settings property and a picker's fields are two levels down, so every picker row binds `pickers` itself and converts in both directions through `bindPickerProperty`. Bypassing `bind` would also bypass validation, the transformers and the debounced save.

## Things that are easy to get wrong

- **The prefix and suffix are DROPPED when the user declines a link**, unless `shouldApplyPrefixSuffixWhenNoLinkSelected` says otherwise. A dangling `"Person: "` with nothing after it is worse than an absent property key, so that is the default — but a document that needs the key present regardless can still ask for it. This replaced an `inlineField` option that hardcoded the `": "` separator AND always emitted it, so declining a link wrote `"Person: "`.
- **`prefix` is not a placeholder.** `inlineField` used to double as one, which is why a picker with no placeholder still showed a useful prompt. A prefix is output formatting — `"Person: "` is a bad prompt — so that fallback is gone, and a caller wanting both passes both.
- **`SelectOptions` carries no `app`, and must not grow one.** It is the shape the published API takes, and a consumer reaching across the plugin boundary must not have to hand the provider back the `App` the provider already holds. `LinkPickerComponent` fills it in from its own field.
- **The API's consumers are read STRUCTURALLY in the tests and the demo vault, never through `watchPluginApi`.** Two different reasons, both deliberate. `api.cross-platform.integration.test.ts` cannot use it because `lib` inside an `evalInObsidian` closure carries only the harness's base helpers unless the repo seeds ODU's integration-test harness plugin, which cannot load on Android at all (`T725-P1`) — and a structural read is the stricter test anyway, since a registry record is a wire format between different bundled library copies and a reader holding no copy is the case that proves it. `demoSetup.ts` cannot use it because a script in a vault has no bundler and no ODU. A consuming PLUGIN should still use `watchPluginApi`, which is what the README and note 06 show.
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
- **`06 Calling it from a script.md` must stay the LAST demo-vault note with buttons.** Its `Ask the API for a person link` button deliberately does not await `select` — a button that waited for you to pick would sit there until the suite's 15-second budget expired and fail — so it returns immediately and leaves the picker OPEN for a human to answer. The buttons suite walks notes in name order, and an open modal would block the next note's buttons. A `07` needs that button reworked, not merely appended after.
- **Drive a behavior by CLICKING its control, so the suite can be cross-platform.** The harness sends keys through Electron's input API, which Android does not have, so a suite that presses a key can only ever run on desktop. `hotkeys.desktop.integration.test.ts` is the one that deliberately does: it exists to prove the key is CONSUMED, which no click and no mocked scope can show.
- **Do not dispatch synthetic `KeyboardEvent`s** to work around that: they are untrusted, Obsidian may ignore them, and a lint rule refuses them. Reach the state through the product's own affordances instead.

## Pending

- Unreleased at `0.0.0`. Before a release: a manual pass on a phone for the six control-strip behaviors (the harness cannot press keys on Android), and a survey of the wider community-plugin ecosystem for overlap — only this fleet was checked. Both are `T718-P44`.

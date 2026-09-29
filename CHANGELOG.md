# CHANGELOG

## 1.1.0

- test(screenshots): merge the harness-owned desktop theme
- docs(agents): merge the on-device check of the converted control-strip pass
- refactor(screenshots): merge the harness-owned caret hiding
- fix(screenshots): merge the caret-free desktop capture and its re-shot frames
- refactor(screenshots): merge the harness-owned status-bar paint and touch emptying
- chore(deps): merge the obsidian-integration-testing 17 float
- chore(deps): merge the obsidian-test-mocks 7 float
- style(comments): stop capitalizing the middle of a wrapped comment
- fix(test): merge the headless demo-vault toolkit install
- fix(deps): restore the lockfile's missing resolved and integrity fields
- docs(agents): name the published api.d.ts in the release-notes checklist
- docs(api): publish the surface as a root api.d.ts and a For plugin developers section
- style(screenshots): silence the sharp no-named-as-default warning, with why the named import breaks
- build(markdownlint): turn on no-soft-break-in-paragraph
- docs: name the API declaration change in the unreleased list, so the release notes carry it
- fix: declare the API for the base to publish, so the load broadcast names its contract version
- test: drive the control-strip pass with the harness's trusted mobile input
- test: make the mobile store shots byte-reproducible
- test: move the picker suites' waiting to Node, and raise obsidian-dev-utils to 103.2.0
- fix(deps): float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- chore(deps): drop the two dead dedupe overrides
- chore(deps): drop the dead markdown-it override
- chore(deps): drop the dead js-yaml override
- docs: replace the private rule-id citations with what they assert
- docs: name the library and the sibling plugins so a reader can resolve them
- docs: replace the private tracker references with what they pointed at
- docs: point the soft-keyboard notes at the harness that now owns them
- refactor(android): take the soft-keyboard recipe from the harness
- refactor(android): drive the picker's controls with trusted taps
- chore: adopt the npm run gate branch gate
- docs(agents): record where the picker's spellcheck rule now lives
- feat(picker): spell-check the box while it can name the note being created
- docs: name the unversioned demo-vault asset and the folder it unzips into
- chore: make the LICENSE copyright line checkable by the linter and guard it against the year roll-over
- test(test-mocks): await the trusted-input helpers, and drop the app.plugins stub
- docs(agents): record segmentMatchMode and the 1.1.0 contract as unreleased on main
- feat(matching): add a configurable segment match rule
- docs(agents): drop the unreleased-commit count, which goes stale on the next commit
- test(integration): raise the soft keyboard for the mobile listing shots
- refactor(modal): converge the control strip onto obsidian-dev-utils' command builder
- fix(build): wire build:compile to buildCompile and drop the duplicate leaf script

## 1.0.1

- chore(deps): sweep caret-ranged dependencies to latest
- fix(deps): move to obsidian-integration-testing 11 and obsidian-dev-utils 96.5.2
- fix(deps): drop the brace-expansion file: override that breaks a clean install
- docs(screenshots): add the mobile half of the listing set

## 1.0.0

- Initial implementations

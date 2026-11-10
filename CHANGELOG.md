# CHANGELOG

## 1.3.1

This release has 1 fix and 3 documentation changes. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **deps:** override glob to 14.0.3 to clear GHSA-3g3m-2fjr-6pw4

### Documentation

- **changelog:** regroup the published release notes for readers
- make issue attachments optional and strongly encouraged
- link to the Obsidian resources page

## 1.3.0

This release has 3 new features and 5 documentation changes. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- keep the selection as the inserted link's display text
- **api:** named note creators for the picker commands
- add a Report a bug command

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- **readme:** cut the README to a landing page, detail moved into the demo vault and docs/api.md
- **readme:** add a Similar plugins section

## 1.2.0

This release has 1 new feature and 2 documentation changes. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- **api:** ship the API contract as a copyable `api-contract.ts` beside `api.d.ts`; copying it needs `@mnaoumov/typescript-lib` 1.5.0 or later and `@mnaoumov/obsidian-lib`

### Documentation

- **readme:** lead the Debugging section with `Advanced Debug Mode`
- mark plugin names as code in prose and comments

## 1.1.0

This release has 2 new features, 6 fixes and 12 documentation changes. 21 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- **picker:** spell-check the box while it can name the note being created
- **matching:** add a configurable segment match rule

### Fixed

- **screenshots:** merge the caret-free desktop capture and its re-shot frames
- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- declare the API for the base to publish, so the load broadcast names its contract version
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

### Documentation

- **agents:** merge the on-device check of the converted control-strip pass
- **agents:** name the published api.d.ts in the release-notes checklist
- **api:** publish the surface as a root api.d.ts and a For plugin developers section
- name the API declaration change in the unreleased list, so the release notes carry it
- replace the private rule-id citations with what they assert
- name the library and the sibling plugins so a reader can resolve them
- replace the private tracker references with what they pointed at
- point the soft-keyboard notes at the harness that now owns them
- **agents:** record where the picker's spellcheck rule now lives
- name the unversioned demo-vault asset and the folder it unzips into
- **agents:** record segmentMatchMode and the 1.1.0 contract as unreleased on main
- **agents:** drop the unreleased-commit count, which goes stale on the next commit

## 1.0.1

This release has 2 fixes and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

### Documentation

- **screenshots:** add the mobile half of the listing set

## 1.0.0

- Initial implementations

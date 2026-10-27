# Calling `Link Picker` from a plugin or a script

The picker is callable from another plugin or a script, and that is where this plugin came from: it is an extraction of a script whose every consumer was a `Templater` template writing a link into a property value. Those callers want the **string**, not an edit at a cursor, so the API is not an extra bolted onto a command — it is the other half of the plugin.

[06 Calling it from a script](<../demo-vault/06 Calling it from a script.md>) in the demo vault has a runnable version of what follows.

## The files to copy

The types are in [`api.d.ts`](../api.d.ts) at the root of this repository, where every option is documented member by member. Copy that file into your own plugin: it imports from `obsidian` and nothing else, so it costs you no dependency on this plugin and none on `@mnaoumov/obsidian-lib`.

Beside it, [`api-contract.ts`](../api-contract.ts) holds the published API's contract, `LINK_PICKER_API_CONTRACT`: for `select`, a schema over its arguments and a schema over what it resolves to. It is the constant this plugin publishes with the API, so copy it next to `api.d.ts` and pass it as the `contract`, and both sides check the same definition.

It needs two packages beside `obsidian`:

- [`@mnaoumov/typescript-lib`](https://www.npmjs.com/package/@mnaoumov/typescript-lib), `1.5.0` or later, whose `api-contract` and `type-guards` entry points supply the contract type, the [Standard Schema](https://standardschema.dev) builders and the guard builders;
- [`@mnaoumov/obsidian-lib`](https://www.npmjs.com/package/@mnaoumov/obsidian-lib), whose `file-system` entry point supplies the path-or-file guard.

So the file itself is only this plugin's checks and the constant. Install both (`npm install @mnaoumov/typescript-lib @mnaoumov/obsidian-lib`) when you copy it; `api.d.ts` still needs nothing. It is not named `api.ts`, because TypeScript would read `api.d.ts` as that file's own declarations.

## Versioning

The API is published through a cross-plugin API registry, keyed by the plugin id, version-negotiated, and revoked automatically when the plugin is disabled. The contract version is **`1.1.0`**, and it moves independently of the plugin's own version — pin a range against the contract, not against a release.

## Consuming it

If your plugin already uses [`@mnaoumov/obsidian-lib`](https://mnaoumov.dev/obsidian-lib/guides/cross-plugin-apis/), `watchPluginApi` is the whole of it:

```typescript
import type { LinkPickerApi } from './api.d.ts';

import { watchPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';

import { LINK_PICKER_API_CONTRACT } from './api-contract.ts';

const ref = watchPluginApi<LinkPickerApi>({
  apiVersionRange: '^1',
  app: this.app,
  component: this,
  contract: LINK_PICKER_API_CONTRACT,
  pluginId: 'link-picker'
});

// `ref.value` is `null` until the plugin has loaded, and becomes non-null on its own.
const api = await ref.whenAvailable();
const link = await api.select({ folderPath: 'People', prefix: 'Person: ' });
// → 'Person: [[Ada Lovelace|Ada]]'
```

If it does not — and is not going to — you still need no dependency on anything. The registry, and the two events a plugin announces itself through, are a documented wire protocol reachable with the `obsidian` module alone; [Plugin API protocol](https://mnaoumov.dev/obsidian-lib/guides/plugin-api-protocol/) is that route written out, and `api.d.ts` types it just as well, since nothing in that file imports the library either.

## What `select` does

`select` resolves with the link text and **rejects** when the picker is dismissed — dismissing is the caller's cue that the user backed out, which is different from the empty string that `No link` returns. Every option is optional and anything omitted falls back to the plugin's settings; three are worth knowing before you design around the API:

- **`createNote`**
  - called when the user picks `Create new`, and given the folder the picker is currently rooted at plus what they typed. This is the hook the whole API exists for: validating a name, deriving a subfolder from it, seeding frontmatter and applying a template are vault conventions, and none of them are expressible in settings. Without it the plugin creates an empty note.
- **`prefix`** and **`suffix`**
  - wrap the link — a prefix of `"Person: "` produces `Person: [[Ada]]` — and **`shouldApplyPrefixSuffixWhenNoLinkSelected`** decides whether they are still emitted when the user presses `No link`. Off by default, so declining returns `''` rather than a `"Person: "` with nothing after it.
- **`sourcePathOrFile`**
  - the note the link is written INTO, which decides whether it comes out relative or absolute. Defaults to the active file, and worth passing explicitly when the note being written to is not the one Obsidian considers active — which is the case while a template renders a brand-new note.

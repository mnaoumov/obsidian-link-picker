# Calling it from a script

Everything so far has been the command: you run it, and a link lands at your cursor. That is the half of the plugin with a keyboard shortcut, and it is not the half the plugin was built for.

The picker was extracted from a script in the author's own vault whose every caller was a Templater template writing a link into a property value:

```text
- <% await select({ folderPath: 'Legal/Суд', prefix: 'Суд: ' }) %>
```

Seventeen templates, and not one of them wanted an edit at a cursor. They wanted the **string**. So the plugin publishes its picker as a callable API, and a command-only version of it would have served none of them.

## What is published

```code-button
---
caption: Ask the plugin what it publishes
---
require('/demoSetup.ts').reportApi();
```

Manual equivalent: none — this reads the cross-plugin API registry, which has no UI of its own.

The version it reports is the **contract** version, not the plugin's. They move independently: the plugin may reach `2.0.0` while the API stays on `1.0.0`, and a consumer pins a range against the contract.

## Asking it for a link

```code-button
---
caption: Ask the API for a person link
---
require('/demoSetup.ts').askApiForALink(app);
```

Manual equivalent: none. This is the half of the plugin that has no command.

The picker opens rooted at `People`. Pick someone and a notice shows the exact string the script got back — `Person: [[Ada Lovelace|Ada]]`. Press `No link` and the string is empty. Press `Escape` and the call **rejects** instead, which is how a caller tells "the user declined a link" apart from "the user backed out".

## The hook the API exists for

The button above passes a `createNote`, and that is the point of the whole interface. Type a name nothing matches, press **Create new**, and the script — not the plugin — decides what happens. This one refuses a name beginning with `!`; try `!Nobody` and watch it say so.

Real vaults do much more there: split a person's name and file them under their initial, seed `firstName` and `lastName` into the frontmatter, apply a template. None of that is expressible in settings, which is why [04 Named pickers](<./04 Named pickers.md>) stops where it does — a named picker carries a folder and a label, and anything richer is code.

Without the hook the plugin creates an empty note and gets out of the way.

## How a plugin consumes it

The demo script above reads the registry record directly, because a script in a vault has no bundler and no copy of `obsidian-dev-utils`. A **plugin** has both, and uses the consumer function instead:

```typescript
import { watchPluginApi } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';

const ref = watchPluginApi<LinkPickerApi>({
  apiVersionRange: '^1',
  app: this.app,
  component: this,
  pluginId: 'link-picker'
});

const link = await ref.whenAvailable();
```

`ref.value` is `null` until Link Picker has loaded and becomes non-`null` on its own, so load order is not something a consumer has to solve. If Link Picker is later disabled, the value goes back to `null` rather than leaving a handle pointing into a torn-down plugin.

## Where next

- [00 Start](<./00 Start.md>) — the index, and the button that puts this vault back as you found it.

import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import type { Picker } from './plugin-settings.ts';

import { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentConstructorParams) {
    super({
      ...params,
      pluginSettingsClass: PluginSettings
    });
  }

  protected override registerValidators(): void {
    this.registerValidator('pickers', (pickers): MaybeReturn<string> => validatePickers(pickers));
  }
}

/**
 * Rejects a picker list that could not be turned into commands.
 *
 * The whole list is validated as one value because that is the granularity Obsidian's settings state
 * has, and because the failures are relational — a duplicate needs two pickers to be a duplicate. An
 * invalid list falls back to the default empty one, so a malformed `data.json` registers no picker
 * commands at all rather than registering colliding ones.
 *
 * @param pickers - The pickers to validate.
 * @returns The validation message, or nothing when the list is usable.
 */
function validatePickers(pickers: readonly Picker[]): MaybeReturn<string> {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const picker of pickers) {
    if (!picker.name) {
      return 'Every picker needs a name — it is what its command is called.';
    }

    if (seenNames.has(picker.name)) {
      return `Two pickers are both named "${picker.name}". Names become command names, so they have to differ.`;
    }

    if (!picker.id) {
      return `Picker "${picker.name}" has no id. Add pickers here rather than by hand-editing data.json.`;
    }

    if (seenIds.has(picker.id)) {
      return `Picker "${picker.name}" reuses another picker's id. Ids are what hotkeys are bound to, so they have to differ.`;
    }

    seenIds.add(picker.id);
    seenNames.add(picker.name);
  }
}

import type { App, TFile } from 'obsidian';

import {
  asCodeBlock,
  createFragmentWithCodeBlocks
} from '@mnaoumov/obsidian-lib/html-element';
import { Notice } from 'obsidian';

const PLUGIN_ID = 'link-picker';
const PLUGIN_NAME = 'Link Picker';

const SCRATCH_NOTE_PATH = 'Materials/01 Picking a link/Scratch.md';
const PEOPLE_FOLDER_PATH = 'Materials/01 Picking a link/People';

/**
 * The key the plugin's bundled `@mnaoumov/obsidian-lib` publishes its API registry under, on the realm global.
 *
 * A script in a vault has no bundler and no copy of the library, so it reads the record structurally —
 * which the registry is designed for: every plugin bundles its own library copy, so a record is a wire
 * format between versions and holds nothing but plain data and plain functions. A PLUGIN consuming this
 * API would use `watchPluginApi` instead; see the note beside this file.
 */
const PLUGIN_API_REGISTRY_STATE_KEY = 'pluginApiRegistry';

const PERSON_PICKER = {
  folderPath: PEOPLE_FOLDER_PATH,
  id: 'demo-person-picker',
  includeSubfolders: false,
  name: 'Insert person',
  placeholder: 'Who?',
  prefix: 'Person: ',
  shouldAllowCreate: true,
  shouldApplyPrefixSuffixWhenNoLinkSelected: false,
  suffix: '',
  trigger: '@'
};

interface ApiRegistry {
  readonly records: Record<string, PublishedApiRecord[] | undefined>;
}

interface ApiRegistryState {
  readonly value?: ApiRegistry;
}

interface DemoPicker {
  readonly id?: string;
}

interface LinkPickerApi {
  readonly select: (params: LinkPickerApiSelectParams) => Promise<string>;
}

interface LinkPickerApiSelectParams {
  readonly createNote?: (folderPath: string, newNoteTitle: string) => Promise<TFile>;
  readonly folderPath?: string;
  readonly includeSubfolders?: boolean;
  readonly placeholder?: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

interface PickerSettings {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- `editAndSave` hands over the live settings object, and the demo replaces its picker list in place.
  pickers: unknown[];
}

interface PluginWithSettings {
  readonly pluginSettingsComponent: SettingsComponent;
}

interface PublishedApiRecord {
  readonly api: LinkPickerApi;
  readonly apiVersion: string;
  readonly isRevoked: boolean;
}

interface SettingsComponent {
  readonly editAndSave: (editor: (settings: PickerSettings) => void) => Promise<void>;
}

interface StateBagWindow {
  readonly __obsidianLib?: Record<string, ApiRegistryState | undefined>;
}

/**
 * Configures a named picker scoped to the `People` folder, which becomes its own command.
 *
 * Manual equivalent: open **Settings → `Link Picker`**, press `+` beside **Pickers**, and fill the page
 * in — name `Insert person`, trigger `@`, folder `Materials/01 Picking a link/People`, prefix `Person: `.
 */
export async function addPersonPicker(app: App): Promise<void> {
  await editSettings(app, (settings) => {
    settings.pickers = [...settings.pickers.filter((picker) => isNotDemoPicker(picker)), PERSON_PICKER];
  });
  new Notice(createFragmentWithCodeBlocks(`Added the person picker. Look for ${asCodeBlock(`${PLUGIN_NAME}: Insert person`)} in the command palette, or type ${asCodeBlock('@')} in a note.`));
}

/**
 * Opens the picker THROUGH THE API and reports the string it returns.
 *
 * Deliberately not awaited here: `select` settles only once you pick something, and a code button that
 * waited for you would sit there spinning. The notice arrives when you answer.
 *
 * The `createNote` hook is the whole reason this API exists — it is where a vault's own conventions live,
 * and none of them are expressible in settings. This one just refuses a name it does not like.
 *
 * Manual equivalent: none. This is the half of the plugin that has no command.
 */
export function askApiForALink(app: App): void {
  const api = getApi();
  if (!api) {
    return;
  }

  api.select({
    async createNote(folderPath: string, newNoteTitle: string): Promise<TFile> {
      if (newNoteTitle.startsWith('!')) {
        throw new Error(`This vault does not allow a person named "${newNoteTitle}".`);
      }
      return await app.vault.create(`${folderPath}/${newNoteTitle}.md`, `# ${newNoteTitle}\n`);
    },
    folderPath: PEOPLE_FOLDER_PATH,
    placeholder: 'Who?',
    prefix: 'Person: '
  })
    .then((link: string) => {
      new Notice(`The API returned:\n${link || '(the empty string — you chose "No link")'}`);
    })
    .catch(() => {
      new Notice('The API rejected. Dismissing the picker does that, which is different from choosing no link.');
    });

  new Notice('The picker is open. What you pick comes back to the script as a string.');
}

/**
 * Opens a scratch note in edit mode, so there is a cursor for a link to be inserted at.
 *
 * The picker writes at the cursor, so it needs a note being EDITED — a note in reading view has no
 * cursor, and the command is unavailable there.
 *
 * Manual equivalent: open any note and click into its text.
 */
export async function openScratchNote(app: App): Promise<void> {
  const existingFile = app.vault.getFileByPath(SCRATCH_NOTE_PATH);
  const file = existingFile ?? await app.vault.create(SCRATCH_NOTE_PATH, '# Scratch\n\nPut the cursor below and insert a link.\n\n');
  await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'source' } });
  new Notice(createFragmentWithCodeBlocks(`Opened Scratch.md in edit mode. Run ${asCodeBlock(`${PLUGIN_NAME}: Insert link...`)} from the command palette.`));
}

/**
 * Reports what the plugin publishes: the contract version, and the methods on it.
 *
 * Manual equivalent: none — this reads the cross-plugin API registry, which has no UI.
 */
export function reportApi(): void {
  const record = getRecord();

  if (!record) {
    new Notice(`The ${PLUGIN_ID} plugin has published no API. Is it enabled?`);
    return;
  }

  const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(record.api) as object)
    .filter((name) => name !== 'constructor');
  new Notice(`${PLUGIN_ID} publishes API ${record.apiVersion}: ${methodNames.join(', ')}.`);
}

/**
 * Puts the vault back: the scratch note is deleted and the demo picker removed.
 *
 * Manual equivalent: delete `Scratch.md`, and delete the picker from **Settings → `Link Picker`**.
 */
export async function resetDemo(app: App): Promise<void> {
  const scratchNote = app.vault.getFileByPath(SCRATCH_NOTE_PATH);
  if (scratchNote) {
    await app.fileManager.trashFile(scratchNote);
  }

  await editSettings(app, (settings) => {
    settings.pickers = settings.pickers.filter((picker) => isNotDemoPicker(picker));
  });
  new Notice('Removed the scratch note and the demo picker.');
}

async function editSettings(app: App, editor: (settings: PickerSettings) => void): Promise<void> {
  const plugin: unknown = app.plugins.plugins[PLUGIN_ID];
  if (!isPluginWithSettings(plugin)) {
    new Notice(`The ${PLUGIN_ID} plugin is not enabled.`);
    return;
  }

  await plugin.pluginSettingsComponent.editAndSave(editor);
}

function getApi(): LinkPickerApi | null {
  const record = getRecord();

  if (!record) {
    new Notice(`The ${PLUGIN_ID} plugin has published no API. Is it enabled?`);
    return null;
  }

  return record.api;
}

function getRecord(): null | PublishedApiRecord {
  const stateBagWindow = window as StateBagWindow;
  const registry = stateBagWindow.__obsidianLib?.[PLUGIN_API_REGISTRY_STATE_KEY]?.value;
  return registry?.records[PLUGIN_ID]?.find((candidate) => !candidate.isRevoked) ?? null;
}

function isNotDemoPicker(picker: unknown): boolean {
  return (picker as DemoPicker).id !== PERSON_PICKER.id;
}

function isPluginWithSettings(plugin: unknown): plugin is PluginWithSettings {
  return typeof plugin === 'object' && plugin !== null && 'pluginSettingsComponent' in plugin;
}

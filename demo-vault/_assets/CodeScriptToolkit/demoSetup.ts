import type { App } from 'obsidian';

import { Notice } from 'obsidian';

const PLUGIN_ID = 'link-picker';

const SCRATCH_NOTE_PATH = 'Materials/01 Picking a link/Scratch.md';
const PEOPLE_FOLDER_PATH = 'Materials/01 Picking a link/People';

const PERSON_PICKER = {
  folderPath: PEOPLE_FOLDER_PATH,
  id: 'demo-person-picker',
  includeSubfolders: false,
  inlineField: 'Person',
  name: 'Insert person',
  placeholder: 'Who?',
  shouldAllowCreate: true
};

interface PickerSettings {
  pickers: unknown[];
}

interface SettingsComponent {
  editAndSave(editor: (settings: PickerSettings) => void): Promise<void>;
}

interface PluginWithSettings {
  pluginSettingsComponent: SettingsComponent;
}

/**
 * Configures a named picker scoped to the `People` folder, which becomes its own command.
 *
 * Manual equivalent: open **Settings → Link Picker**, press `+` beside **Pickers**, and fill the page
 * in — name `Insert person`, folder `Materials/01 Picking a link/People`, inline field `Person`.
 */
export async function addPersonPicker(app: App): Promise<void> {
  await editSettings(app, (settings) => {
    settings.pickers = [...settings.pickers.filter(isNotDemoPicker), PERSON_PICKER];
  });
  new Notice('Added the "Insert person" picker. Look for it in the Command Palette.');
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
  new Notice('Opened Scratch.md in edit mode. Run "Link Picker: Insert link..." from the Command Palette.');
}

/**
 * Puts the vault back: the scratch note is deleted and the demo picker removed.
 *
 * Manual equivalent: delete `Scratch.md`, and delete the picker from **Settings → Link Picker**.
 */
export async function resetDemo(app: App): Promise<void> {
  const scratchNote = app.vault.getFileByPath(SCRATCH_NOTE_PATH);
  if (scratchNote) {
    await app.vault.delete(scratchNote);
  }

  await editSettings(app, (settings) => {
    settings.pickers = settings.pickers.filter(isNotDemoPicker);
  });
  new Notice('Removed the scratch note and the demo picker.');
}

async function editSettings(app: App, editor: (settings: PickerSettings) => void): Promise<void> {
  const plugin = app.plugins.plugins[PLUGIN_ID] as unknown as PluginWithSettings | undefined;
  if (!plugin) {
    new Notice(`The ${PLUGIN_ID} plugin is not enabled.`);
    return;
  }

  await plugin.pluginSettingsComponent.editAndSave(editor);
}

function isNotDemoPicker(picker: unknown): boolean {
  return (picker as { id?: string }).id !== PERSON_PICKER.id;
}

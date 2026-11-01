import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type {
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/editor-command-handler';

import type { LinkPickerComponent } from '../picker/link-picker-component.ts';
import type {
  Picker,
  PluginSettings
} from '../settings/plugin-settings.ts';

interface InsertLinkEditorCommandHandlerConstructorParams {
  readonly linkPickerComponent: LinkPickerComponent;

  /**
   * The configured picker this command opens, or `null` for the generic command.
   */
  readonly picker: null | Picker;

  readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
}

/**
 * Picks a note and writes a link to it at the cursor.
 *
 * Any selection seeds the picker's query and is then replaced by the link — the same gesture as typing
 * `[[`, except the picker can be navigated by folder. With `shouldUseSelectionAsDisplayText` on, the
 * selection is kept as the link's display text instead of disappearing.
 *
 * One instance is the generic `Insert link...`; the rest are the configured pickers, one command each.
 * A configured command's id is built from the picker's stable id rather than its name, so renaming a
 * picker keeps whatever hotkey the user bound to it.
 */
export class InsertLinkEditorCommandHandler extends EditorCommandHandler {
  private readonly linkPickerComponent: LinkPickerComponent;
  private readonly picker: null | Picker;
  private readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;

  public constructor(params: InsertLinkEditorCommandHandlerConstructorParams) {
    super({
      icon: 'lucide-link',
      id: params.picker ? `picker-${params.picker.id}` : 'insert-link',
      name: params.picker?.name ?? 'Insert link...'
    });

    this.linkPickerComponent = params.linkPickerComponent;
    this.picker = params.picker;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  protected override async executeEditor(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    const selection = editor.getSelection();
    let link: string;

    try {
      link = await this.linkPickerComponent.select({
        folderPath: this.picker?.folderPath ?? '',
        includeSubfolders: this.picker?.includeSubfolders ?? false,
        initialQuery: selection,
        linkDisplayText: this.getLinkDisplayText(selection),
        noteCreatorName: this.picker?.noteCreatorName ?? '',
        placeholder: this.picker?.placeholder ?? '',
        prefix: this.picker?.prefix ?? '',
        shouldAllowCreate: this.picker?.shouldAllowCreate ?? true,
        shouldApplyPrefixSuffixWhenNoLinkSelected: this.picker?.shouldApplyPrefixSuffixWhenNoLinkSelected ?? false,
        sourcePathOrFile: context.file ?? '',
        suffix: this.picker?.suffix ?? ''
      });
    } catch {
      // Dismissing the picker rejects. That is the user declining, not a failure, so it produces neither a notice nor an edit.
      return;
    }

    editor.replaceSelection(link);
  }

  /**
   * Picks the display text of the inserted link: the selection when this command keeps it, otherwise none.
   *
   * The setting is read when the command runs rather than when it is built, so the generic command follows
   * it without being re-registered.
   */
  private getLinkDisplayText(selection: string): string {
    const shouldUseSelectionAsDisplayText = this.picker?.shouldUseSelectionAsDisplayText
      ?? this.pluginSettingsComponent.settings.shouldUseSelectionAsDisplayText;
    return shouldUseSelectionAsDisplayText ? selection : '';
  }
}

import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';

import type { LinkPickerComponent } from '../link-picker-component.ts';
import type { Picker } from '../plugin-settings.ts';

interface InsertLinkEditorCommandHandlerConstructorParams {
  readonly app: App;
  readonly linkPickerComponent: LinkPickerComponent;

  /**
   * The configured picker this command opens, or `null` for the generic command.
   */
  readonly picker: null | Picker;
}

/**
 * Picks a note and writes a link to it at the cursor.
 *
 * Any selection seeds the picker's query and is then replaced by the link — the same gesture as typing
 * `[[`, except the picker can be navigated by folder.
 *
 * One instance is the generic `Insert link...`; the rest are the configured pickers, one command each.
 * A configured command's id is built from the picker's stable id rather than its name, so renaming a
 * picker keeps whatever hotkey the user bound to it.
 */
export class InsertLinkEditorCommandHandler extends EditorCommandHandler {
  private readonly app: App;
  private readonly linkPickerComponent: LinkPickerComponent;
  private readonly picker: null | Picker;

  public constructor(params: InsertLinkEditorCommandHandlerConstructorParams) {
    super({
      icon: 'lucide-link',
      id: params.picker ? `picker-${params.picker.id}` : 'insert-link',
      name: params.picker?.name ?? 'Insert link...'
    });

    this.app = params.app;
    this.linkPickerComponent = params.linkPickerComponent;
    this.picker = params.picker;
  }

  protected override async executeEditor(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    let link: string;

    try {
      link = await this.linkPickerComponent.select({
        app: this.app,
        folderPath: this.picker?.folderPath ?? '',
        includeSubfolders: this.picker?.includeSubfolders ?? false,
        initialQuery: editor.getSelection(),
        inlineField: this.picker?.inlineField ?? '',
        placeholder: this.picker?.placeholder ?? '',
        shouldAllowCreate: this.picker?.shouldAllowCreate ?? true,
        sourcePathOrFile: context.file ?? ''
      });
    } catch {
      // Dismissing the picker rejects. That is the user declining, not a failure, so it produces neither a notice nor an edit.
      return;
    }

    editor.replaceSelection(link);
  }
}

import type {
  App,
  Editor,
  MarkdownFileInfo
} from 'obsidian';

import { EditorCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/editor-command-handler';

import type { LinkPickerComponent } from '../link-picker-component.ts';

interface InsertLinkEditorCommandHandlerConstructorParams {
  readonly app: App;
  readonly linkPickerComponent: LinkPickerComponent;
}

/**
 * Picks a note and writes a link to it at the cursor.
 *
 * Any selection seeds the picker's query and is then replaced by the link — the same gesture as typing
 * `[[`, except the picker can be navigated by folder.
 */
export class InsertLinkEditorCommandHandler extends EditorCommandHandler {
  private readonly app: App;
  private readonly linkPickerComponent: LinkPickerComponent;

  public constructor(params: InsertLinkEditorCommandHandlerConstructorParams) {
    super({
      icon: 'lucide-link',
      id: 'insert-link',
      name: 'Insert link...'
    });

    this.app = params.app;
    this.linkPickerComponent = params.linkPickerComponent;
  }

  protected override async executeEditor(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    let link: string;

    try {
      link = await this.linkPickerComponent.select({
        app: this.app,
        initialQuery: editor.getSelection(),
        sourcePathOrFile: context.file ?? ''
      });
    } catch {
      // Dismissing the picker rejects. That is the user declining, not a failure, so it produces neither a notice nor an edit.
      return;
    }

    editor.replaceSelection(link);
  }
}

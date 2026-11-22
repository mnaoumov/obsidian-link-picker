import type {
  App,
  TAbstractFile,
  TFile,
  TFolder
} from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import {
  asFile,
  isFolder
} from '@mnaoumov/obsidian-lib/file-system';
import {
  Component,
  MarkdownRenderer
} from 'obsidian';

interface NotePreviewComponentConstructorParams {
  readonly app: App;
  readonly resolveFolderNote: (this: void, folder: TFolder) => null | TFile;
}

/**
 * The pane that shows the highlighted row's note while the picker stays open.
 *
 * A pane of the picker's own rather than Obsidian's `Page preview` popover: that popover does nothing while
 * the core plugin is off, is placed against a HOVERED element and closes on mouse-out, so it cannot follow
 * arrow-key navigation, and a phone has no hover at all.
 */
export class NotePreviewComponent extends ComponentEx {
  public readonly el: HTMLDivElement;

  private readonly app: App;

  private renderComponent: Component | null = null;

  /**
   * `undefined` means nothing has been rendered yet; `null` means the empty state has been.
   */
  private renderedFile: null | TAbstractFile | undefined = undefined;

  private renderToken = 0;
  private readonly resolveFolderNote: (this: void, folder: TFolder) => null | TFile;

  public constructor(params: NotePreviewComponentConstructorParams) {
    super();
    this.app = params.app;
    this.resolveFolderNote = params.resolveFolderNote;
    this.el = createDiv('link-picker-preview');
  }

  /**
   * Forgets what is shown, so the next {@link show} renders afresh even for the same file.
   */
  public clear(): void {
    this.renderToken++;
    this.renderedFile = undefined;
    this.renderComponent?.unload();
    this.renderComponent = null;
    this.el.empty();
  }

  public override onunload(): void {
    this.clear();
    super.onunload();
  }

  /**
   * Shows a row's file.
   *
   * Several rows share one file — one per alias — so moving between them renders nothing new.
   *
   * @param file - The row's file, or `null` when no row is highlighted.
   */
  public async show(file: null | TAbstractFile): Promise<void> {
    if (file === this.renderedFile) {
      return;
    }

    this.clear();
    this.renderedFile = file;
    const token = this.renderToken;

    // A plain child per render, unloaded by the next one, which is what tears down whatever the rendered
    // Markdown registered (embeds, code block processors) instead of leaking it into the picker's lifetime.
    const renderComponent = new Component();
    renderComponent.load();
    this.renderComponent = renderComponent;

    const noteFile = this.resolveNoteFile(file);

    if (!noteFile) {
      this.el.createDiv({
        cls: 'link-picker-preview-empty',
        text: file ? 'This folder has no folder note to preview.' : 'Nothing to preview.'
      });
      return;
    }

    this.el.createDiv({ cls: 'link-picker-preview-path', text: noteFile.path });
    const bodyEl = this.el.createDiv('link-picker-preview-body markdown-rendered');

    // A note is rendered from its text; anything else — an image, a PDF — as the embed Obsidian would show.
    const markdown = noteFile.extension === 'md'
      ? await this.app.vault.cachedRead(noteFile)
      : `![[${this.app.metadataCache.fileToLinktext(noteFile, noteFile.path, false)}]]`;

    // A later `show` replaced this render while the file was being read; its output belongs to nobody.
    if (token !== this.renderToken) {
      return;
    }

    await MarkdownRenderer.render(this.app, markdown, bodyEl, noteFile.path, renderComponent);
  }

  private resolveNoteFile(file: null | TAbstractFile): null | TFile {
    if (!file) {
      return null;
    }

    if (isFolder(file)) {
      return this.resolveFolderNote(file);
    }

    return asFile(file);
  }
}

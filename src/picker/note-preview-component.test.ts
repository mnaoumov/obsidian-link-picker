import type {
  App as AppOriginal,
  TAbstractFile,
  TFile,
  TFolder
} from 'obsidian';
import type { MockInstance } from 'vitest';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  MarkdownRenderer
} from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NotePreviewComponent } from './note-preview-component.ts';

let app: AppOriginal;
let appMock: App;
let render: MockInstance<typeof MarkdownRenderer.render>;

beforeEach(() => {
  vi.restoreAllMocks();
  appMock = App.createConfigured__();
  app = appMock.asOriginalType__();
  render = vi.spyOn(MarkdownRenderer, 'render');
  appMock.vault.createFolderSync__('Notes');
  appMock.vault.createSync__('Notes/Notes.md', 'About notes');
  appMock.vault.createSync__('Notes/Ada.md', 'Ada body');
  appMock.vault.createSync__('Notes/image.png', '');
  appMock.vault.createFolderSync__('Empty');
});

describe('NotePreviewComponent', () => {
  it('should render a note from its text', async () => {
    const preview = createPreview();

    await preview.show(file('Notes/Ada.md'));

    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[1]).toBe('Ada body');
    expect(render.mock.calls[0]?.[3]).toBe('Notes/Ada.md');
    expect(preview.el.querySelector('.link-picker-preview-path')?.textContent).toBe('Notes/Ada.md');
  });

  it('should render a file that is not a note as the embed Obsidian would show', async () => {
    const preview = createPreview();

    await preview.show(file('Notes/image.png'));

    // Shortest form, resolved against the same source path the render is given.
    expect(render.mock.calls[0]?.[1]).toBe('![[image.png]]');
    expect(render.mock.calls[0]?.[3]).toBe('Notes/image.png');
  });

  it('should preview a folder through its folder note', async () => {
    const preview = createPreview();

    await preview.show(file('Notes'));

    expect(render.mock.calls[0]?.[1]).toBe('About notes');
  });

  it('should say so when a folder has no folder note', async () => {
    const preview = createPreview();

    await preview.show(file('Empty'));

    expect(render).not.toHaveBeenCalled();
    expect(preview.el.textContent).toBe('This folder has no folder note to preview.');
  });

  it('should say so when no row is highlighted', async () => {
    const preview = createPreview();

    await preview.show(null);

    expect(preview.el.textContent).toBe('Nothing to preview.');
  });

  it('should not render again for another row of the same file', async () => {
    // One row per alias, all of them the same note: moving between them changes nothing worth a render.
    const preview = createPreview();

    await preview.show(file('Notes/Ada.md'));
    await preview.show(file('Notes/Ada.md'));

    expect(render).toHaveBeenCalledOnce();
  });

  it('should render the same file again once cleared', async () => {
    const preview = createPreview();

    await preview.show(file('Notes/Ada.md'));
    preview.clear();
    await preview.show(file('Notes/Ada.md'));

    expect(render).toHaveBeenCalledTimes(2);
  });

  it('should drop a render that a later one overtook while the file was being read', async () => {
    let finishFirstRead: (value: string) => void = failFirstRead;
    const cachedRead = vi.spyOn(app.vault, 'cachedRead');
    cachedRead.mockImplementationOnce(async () =>
      await new Promise<string>((resolve) => {
        finishFirstRead = resolve;
      })
    );
    const preview = createPreview();

    const first = preview.show(file('Notes/Ada.md'));
    await preview.show(file('Notes/Notes.md'));
    finishFirstRead('stale');
    await first;

    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[1]).toBe('About notes');
  });

  it('should empty the pane when unloaded', async () => {
    const preview = createPreview();
    preview.load();

    await preview.show(file('Notes/Ada.md'));
    preview.unload();

    expect(preview.el.childElementCount).toBe(0);
  });
});

function createPreview(): NotePreviewComponent {
  return new NotePreviewComponent({
    app,
    resolveFolderNote: (folder: TFolder): null | TFile => app.vault.getFileByPath(`${folder.path}/${folder.name}.md`)
  });
}

function failFirstRead(): never {
  throw new Error('The first read never started.');
}

function file(path: string): TAbstractFile {
  return castTo<TAbstractFile>(app.vault.getAbstractFileByPath(path));
}

import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The plugin's central promise, end to end against a real Obsidian: the command opens the picker, and
 * what is picked lands at the cursor as a link.
 *
 * Cross-platform: the manifest declares `isDesktopOnly: false`, and inserting a link has to hold on a
 * phone as much as on a desktop, so the file name puts it in both projects (G47).
 */

const PLUGIN_ID = 'link-picker';

/**
 * The flow waits on several things in turn, each of which can legitimately take seconds on a cold
 * Obsidian, so it needs more than vitest's 30-second default.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface InsertLinkResult {
  readonly editorText: string;
  readonly wasPickerOpened: boolean;
}

describe('The `Insert link...` command', () => {
  it('writes a link to the picked note at the cursor', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, obsidianModule, pluginId }): Promise<InsertLinkResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const OPEN_TIMEOUT_IN_MILLISECONDS = 10_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;

        // At the vault root, because that is where the picker opens: it lists one folder's contents, and
        // A note buried in a subfolder would not be among them until the folder was navigated into.
        const targetName = `Ada-${stamp}`;
        await app.vault.create(`${targetName}.md`, '# Ada\n');
        const source = await app.vault.create(`Source-${stamp}.md`, '');

        await app.workspace.getLeaf(true).openFile(source);
        await waitUntil({
          message: 'the note being edited is open',
          predicate: () => app.workspace.getActiveFile()?.path === source.path,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });

        // No picker may be open yet: these suites share one Obsidian, and each ends by picking something
        // Rather than by walking away, so a leftover here means an earlier suite broke that contract.
        await waitUntil({
          message: 'no picker left open by an earlier suite',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });

        app.commands.executeCommandById(`${pluginId}:insert-link`);
        await waitUntil({
          message: 'the picker is open',
          predicate: () => document.querySelector('.prompt') !== null,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const wasPickerOpened = document.querySelector('.prompt') !== null;

        const input = document.querySelector('.prompt-input');
        if (!(input instanceof HTMLInputElement)) {
          throw new TypeError('The picker has no input.');
        }

        input.value = targetName;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await waitUntil({
          message: 'the picked note is offered',
          predicate: () => [...document.querySelectorAll('.suggestion-item')].some((el) => el.textContent.includes(targetName)),
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });
        // Clicked rather than typed: the harness drives keys through Electron's input API, which does
        // Not exist on Android, and this behavior has to be proven on both. Addressed by TEXT rather
        // Than by position, so a row the vault happens to also match cannot be picked by mistake.
        const row = [...document.querySelectorAll('.suggestion-item')].find((el) => el.textContent.includes(targetName));
        if (!(row instanceof HTMLElement)) {
          throw new TypeError('The picked note was not offered.');
        }
        row.click();

        await waitUntil({
          message: 'the picker closed',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);

        const editorText = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '';
        return { editorText, wasPickerOpened };
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.wasPickerOpened).toBe(true);
    expect(result.editorText).toContain('Ada-');
    expect(result.editorText).toMatch(/\[\[|]\(/);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

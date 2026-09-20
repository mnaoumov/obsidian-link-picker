import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
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
 * phone as much as on a desktop, so the file name puts it in both projects.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so a closure that waits is a closure that
 * dies on any machine where the thing waited for is slower than that - a cold phone, exactly.
 * `pollInObsidian` is what makes a generous per-wait budget real: it re-runs a short `poll` closure from
 * Node until the Node-side `until` accepts, and each poll is its own short eval.
 */

const PLUGIN_ID = 'link-picker';

const PROMPT_SELECTOR = '.prompt';
const INPUT_SELECTOR = '.prompt-input';
const ROW_SELECTOR = '.suggestion-item';

/**
 * A render settle, short enough to sit inside an act closure without approaching the per-eval cap.
 */
const RENDER_DELAY_IN_MILLISECONDS = 400;

/**
 * Generous on purpose, and affordable now that it is Node's budget rather than one closure's: Android
 * sets the floor, not desktop, and an aged emulator takes tens of seconds to lay out.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * Above the sum of the budgets used below, so a genuine stall reports the NAMED poll timeout rather than
 * losing the race to a bare vitest timeout.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 300_000;

describe('The `Insert link...` command', () => {
  it('writes a link to the picked note at the cursor', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;

    // At the vault root, because that is where the picker opens: it lists one folder's contents.
    // A note buried in a subfolder would not be among them until the folder was navigated into.
    const targetName = `Ada-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { sourcePath, targetName },
      poll({ app, sourcePath: path, targetName: name }): boolean {
        return app.vault.getFileByPath(`${name}.md`) !== null && app.vault.getFileByPath(path) !== null;
      },
      async start({ app, lib: { createNote }, sourcePath: path, targetName: name }): Promise<void> {
        await createNote({
          content: '# Ada\n',
          path: `${name}.md`
        });
        // The source note is deliberately empty, so a content read-back would prove nothing.
        await app.vault.create(path, '');
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the staged notes never appeared in the vault',
      until: (arePresent: boolean): boolean => arePresent
    });

    // `until` runs in Node, so it compares against the path this test already holds.
    const openedPath = await pollInObsidian({
      input: { sourcePath },
      poll({ app }): string {
        return app.workspace.getActiveFile()?.path ?? '';
      },
      async start({ app, sourcePath: path }): Promise<void> {
        const source = app.vault.getFileByPath(path);
        if (!source) {
          throw new Error(`The source note ${path} is gone.`);
        }

        await app.workspace.getLeaf(true).openFile(source);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the note being edited never became the active file',
      until: (path: string): boolean => path === sourcePath
    });

    // No picker may be open yet: these suites share one Obsidian, and each ends by picking something rather than by walking away.
    // A leftover here means an earlier suite broke that contract.
    await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) === null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'a picker was left open by an earlier suite',
      until: (isClosed: boolean): boolean => isClosed
    });

    const wasPickerOpened = await pollInObsidian({
      input: { pluginId: PLUGIN_ID, promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) !== null;
      },
      start({ app, pluginId }): void {
        app.commands.executeCommandById(`${pluginId}:insert-link`);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker never opened',
      until: (isOpen: boolean): boolean => isOpen
    });

    await evalInObsidian({
      async callback({ inputSelector, renderDelayInMilliseconds, targetName: name }): Promise<void> {
        await sleep(renderDelayInMilliseconds);

        const input = document.querySelector(inputSelector);
        if (!(input instanceof HTMLInputElement)) {
          throw new TypeError('The picker has no input.');
        }

        // A dispatched event rather than trusted input: the harness drives keys through Electron's input API, which Android has not got.
        // This behavior has to be proven on both.
        input.value = name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      },
      input: {
        inputSelector: INPUT_SELECTOR,
        renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS,
        targetName
      }
    });

    await pollInObsidian({
      input: { rowSelector: ROW_SELECTOR, targetName },
      poll({ rowSelector, targetName: name }): boolean {
        return [...document.querySelectorAll(rowSelector)].some((el) => el.textContent.includes(name));
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picked note was never offered',
      until: (isOffered: boolean): boolean => isOffered
    });

    await evalInObsidian({
      callback({ rowSelector, targetName: name }): void {
        // Clicked rather than typed: the harness drives keys through Electron's input API, which Android has not got.
        // Addressed by TEXT rather than by position, so a row the vault happens to also match cannot be picked by mistake.
        const row = [...document.querySelectorAll(rowSelector)].find((el) => el.textContent.includes(name));
        if (!(row instanceof HTMLElement)) {
          throw new TypeError('The picked note was not offered.');
        }

        row.click();
      },
      input: { rowSelector: ROW_SELECTOR, targetName }
    });

    await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) === null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker never closed on the pick',
      until: (isClosed: boolean): boolean => isClosed
    });

    const editorText = await evalInObsidian({
      async callback({ app, obsidianModule, renderDelayInMilliseconds }): Promise<string> {
        await sleep(renderDelayInMilliseconds);
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '';
      },
      input: { renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS }
    });

    expect(openedPath).toBe(sourcePath);
    expect(wasPickerOpened).toBe(true);
    expect(editorText).toContain('Ada-');
    expect(editorText).toMatch(/\[\[|]\(/);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

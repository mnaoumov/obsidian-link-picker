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
 * The `Create new` control against a real Obsidian: the note you meant to link to does not have to exist yet.
 * It is created in the folder the picker is currently rooted at, and linked in one gesture.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform: the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so the four waits this flow needs could
 * never each get the budget they declared - and one of them, "the note exists", is the very wait that
 * failed twice at 10 s on an aged emulator. `pollInObsidian` is what makes 60 s real: each poll is its
 * own short eval.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';

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

interface CreateNewNoteResult {
  readonly createdPath: null | string;
  readonly editorText: string;
}

describe('The `Create new` control', () => {
  it('creates the note the typed name asks for and links to it', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const newName = `Created-${stamp}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { sourcePath },
      poll({ app, sourcePath: path }): boolean {
        return app.vault.getFileByPath(path) !== null;
      },
      async start({ app, sourcePath: path }): Promise<void> {
        // The source note is deliberately empty, so a content read-back would prove nothing.
        await app.vault.create(path, '');
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the source note never appeared in the vault',
      until: (isPresent: boolean): boolean => isPresent
    });

    await pollInObsidian({
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

    await pollInObsidian({
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

    // Typed, but matching nothing - which is exactly when creating is the useful answer.
    // There is therefore no row to poll for, so the settle stays inside the closure that types.
    await evalInObsidian({
      async callback({ inputSelector, newName: name, renderDelayInMilliseconds }): Promise<void> {
        await sleep(renderDelayInMilliseconds);

        const input = document.querySelector(inputSelector);
        if (!(input instanceof HTMLInputElement)) {
          throw new TypeError('The picker has no input.');
        }

        input.value = name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(renderDelayInMilliseconds);
        input.focus();
      },
      input: {
        inputSelector: INPUT_SELECTOR,
        newName,
        renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS
      }
    });

    await evalInObsidian({
      callback({ controlSelector, label }): void {
        const buttonEl = [...document.querySelectorAll(controlSelector)]
          .find((el) => el.querySelector('span')?.textContent === label);
        if (!(buttonEl instanceof HTMLElement)) {
          throw new TypeError(`No control labelled ${label}.`);
        }

        buttonEl.click();
      },
      input: { controlSelector: CONTROL_SELECTOR, label: 'Create new' }
    });

    await pollInObsidian({
      input: { newName },
      poll({ app, newName: name }): boolean {
        return app.vault.getAbstractFileByPath(`${name}.md`) !== null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the note was never created',
      until: (isPresent: boolean): boolean => isPresent
    });

    await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) === null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker never closed',
      until: (isClosed: boolean): boolean => isClosed
    });

    const result = await evalInObsidian({
      async callback({ app, newName: name, obsidianModule, renderDelayInMilliseconds }): Promise<CreateNewNoteResult> {
        await sleep(renderDelayInMilliseconds);

        return {
          createdPath: app.vault.getAbstractFileByPath(`${name}.md`)?.path ?? null,
          editorText: app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? ''
        };
      },
      input: { newName, renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS }
    });

    expect(result.createdPath).toContain('Created-');
    expect(result.editorText).toContain('Created-');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

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
 * The `No link` control against a real Obsidian: declining a link is a choice the picker makes available, distinct
 * from dismissing it — a template that asks for an optional link needs an empty answer, not a rejection.
 *
 * Regression cover, too: the row is backed by the vault root, which is a folder, so before this was
 * fixed `Alt + 1` navigated to the root instead of resolving empty.
 *
 * Driven by CLICKING the control rather than by pressing its hotkey, which is what makes this suite
 * cross-platform: the manifest declares `isDesktopOnly: false`, a phone has no `Alt` key, and the
 * harness cannot send keys to Android anyway. The keyboard route is covered separately, on desktop, by
 * `hotkeys.desktop.integration.test.ts`.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so the three waits this flow needs could
 * never each get the budget they declared. `pollInObsidian` is what makes 60 s real: each poll is its own
 * short eval.
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

describe('The `No link` control', () => {
  it('closes it and writes nothing, rather than navigating to the vault root', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const sourcePath = `Source-${stamp}.md`;

    await pollInObsidian({
      input: { sourcePath },
      poll({ app, sourcePath: path }): boolean {
        return app.vault.getFileByPath(path) !== null;
      },
      async start({ lib: { createNote }, sourcePath: path }): Promise<void> {
        await createNote({
          content: 'body',
          path
        });
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

    // The settle, the focus and the click stay in ONE closure: the focus is what the control's
    // `mousedown` `preventDefault` exists to protect.
    await evalInObsidian({
      async callback({ controlSelector, inputSelector, label, renderDelayInMilliseconds }): Promise<void> {
        await sleep(renderDelayInMilliseconds);

        const input = document.querySelector(inputSelector);
        if (!(input instanceof HTMLInputElement)) {
          throw new TypeError('The picker has no input.');
        }

        input.focus();

        const buttonEl = [...document.querySelectorAll(controlSelector)]
          .find((el) => el.querySelector('span')?.textContent === label);
        if (!(buttonEl instanceof HTMLElement)) {
          throw new TypeError(`No control labelled ${label}.`);
        }

        buttonEl.click();
      },
      input: {
        controlSelector: CONTROL_SELECTOR,
        inputSelector: INPUT_SELECTOR,
        label: 'No link',
        renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS
      }
    });

    const wasPickerClosed = await pollInObsidian({
      input: { promptSelector: PROMPT_SELECTOR },
      poll({ promptSelector }): boolean {
        return document.querySelector(promptSelector) === null;
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the picker never closed',
      until: (isClosed: boolean): boolean => isClosed
    });

    const editorText = await evalInObsidian({
      async callback({ app, obsidianModule, renderDelayInMilliseconds }): Promise<string> {
        await sleep(renderDelayInMilliseconds);
        return app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.editor.getValue() ?? '';
      },
      input: { renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS }
    });

    expect(wasPickerClosed).toBe(true);
    expect(editorText).toBe('body');
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

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
 * Spell checking the picker box against a real Obsidian, which is the only place the starting point can
 * be observed: Obsidian builds every `SuggestModal` input with a hardcoded `spellcheck="false"` and never
 * consults `Editor > Spellcheck` there, and `obsidian-test-mocks` does not reproduce that.
 *
 * The box doubles as the new note's title — `Create new` takes what is typed verbatim — so it follows the
 * setting while that offer stands, and is left exactly as Obsidian built it while it does not.
 *
 * Driven by CLICKING `Folders only` rather than pressing its hotkey, which is what makes this suite
 * cross-platform: a phone has no `Alt` key, and the harness cannot send keys to Android anyway.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so the flow's waits shared one budget
 * none of them could have. The vault setting's original value therefore rides through NODE rather than
 * through a closure variable, and the restore is a Node `finally` rather than an in-Obsidian one — which
 * is strictly safer, since a transport failure mid-flow no longer strands the vault on a setting it was
 * never asked for.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const INPUT_SELECTOR = '.prompt-input';
const PROMPT_SELECTOR = '.prompt';
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

describe('spell checking the picker box', () => {
  it('follows the vault setting while a note can be named, and stops while it cannot', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;
    const sourcePath = `Source-${stamp}.md`;

    const originalSpellcheck = await evalInObsidian({
      callback({ app }): unknown {
        return app.vault.getConfig('spellcheck');
      },
      input: {}
    });

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

    // The restore is in a `finally` because the integration suites share ONE Obsidian.
    // A failed read must not leave the next suite opening its box under a setting it never asked for.
    // The assertions sit inside it so each reading can be a `const` at the point it is taken.
    try {
      await setSpellcheck(true);
      await openPicker();
      const whenSettingOn = await readSpellcheck();

      await clickControl('Folders only');
      const whenFoldersOnly = await readSpellcheck();

      await clickControl('Folders only');
      const whenToggledBack = await readSpellcheck();

      await closePicker();

      await setSpellcheck(false);
      await openPicker();
      const whenSettingOff = await readSpellcheck();
      await closePicker();

      expect(whenSettingOn).toBe('true');
      // The value Obsidian itself hardcodes, which is exactly what a box that only finds notes should keep.
      expect(whenFoldersOnly).toBe('false');
      expect(whenToggledBack).toBe('true');
      expect(whenSettingOff).toBe('false');
    } finally {
      await setSpellcheck(originalSpellcheck);
      await closePicker();
    }
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * Clicks a control on the strip.
 *
 * @param label - The control's visible label.
 */
async function clickControl(label: string): Promise<void> {
  await evalInObsidian({
    callback({ controlSelector, label: controlLabel }): void {
      const buttonEl = [...document.querySelectorAll(controlSelector)]
        .find((el) => el.querySelector('span')?.textContent === controlLabel);
      if (!(buttonEl instanceof HTMLElement)) {
        throw new TypeError(`No control labelled ${controlLabel}.`);
      }

      buttonEl.click();
    },
    input: { controlSelector: CONTROL_SELECTOR, label }
  });
}

/**
 * Closes the picker if one is open, by CHOOSING a row rather than by a key press.
 *
 * `Escape` would have to be dispatched untrusted, which Obsidian may ignore, and the trusted `pressKey`
 * is desktop-only while this suite also runs on Android. A pick closes the picker through its own resolve
 * path.
 */
async function closePicker(): Promise<void> {
  const wasOpen = await evalInObsidian({
    callback({ promptSelector, rowSelector }): boolean {
      if (!document.querySelector(promptSelector)) {
        return false;
      }

      const row = document.querySelector(rowSelector);
      if (!(row instanceof HTMLElement)) {
        throw new TypeError('The picker offered nothing to choose.');
      }

      row.click();
      return true;
    },
    input: { promptSelector: PROMPT_SELECTOR, rowSelector: ROW_SELECTOR }
  });

  if (!wasOpen) {
    return;
  }

  await pollInObsidian({
    input: { promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) === null;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never closed',
    until: (isClosed: boolean): boolean => isClosed
  });
}

/**
 * Runs the editor command and waits for the picker's box to come up.
 */
async function openPicker(): Promise<void> {
  await pollInObsidian({
    input: { inputSelector: INPUT_SELECTOR, pluginId: PLUGIN_ID },
    poll({ inputSelector }): boolean {
      return document.querySelector(inputSelector) !== null;
    },
    start({ app, pluginId }): void {
      app.commands.executeCommandById(`${pluginId}:insert-link`);
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never opened',
    until: (isOpen: boolean): boolean => isOpen
  });
}

/**
 * Lets the box settle, then reads the ATTRIBUTE.
 *
 * Not the IDL property, which reports a default for an element carrying no attribute at all — and the
 * absence of the attribute is precisely one of the states this suite has to tell apart. The settle stays
 * inside the closure it guards, because it guards a reading that is about to change rather than one that
 * has already arrived.
 *
 * @returns The `spellcheck` attribute, or `null` when the box carries none.
 */
async function readSpellcheck(): Promise<null | string> {
  return await evalInObsidian({
    async callback({ inputSelector, renderDelayInMilliseconds }): Promise<null | string> {
      await sleep(renderDelayInMilliseconds);
      return document.querySelector(inputSelector)?.getAttribute('spellcheck') ?? null;
    },
    input: { inputSelector: INPUT_SELECTOR, renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS }
  });
}

/**
 * Writes the vault's `Editor > Spellcheck` setting.
 *
 * @param value - What to write, which on the restore is whatever the vault was found with.
 */
async function setSpellcheck(value: unknown): Promise<void> {
  await evalInObsidian({
    callback({ app, value: spellcheck }): void {
      app.vault.setConfig('spellcheck', spellcheck);
    },
    input: { value }
  });
}

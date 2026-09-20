import {
  ContextId,
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The other half of the plugin, end to end against a real Obsidian: another plugin — or a script —
 * reaches the picker through the published API and gets a STRING back.
 *
 * This is the half the extraction was for. The 17 Templater templates the picker came from all write
 * `<prefix><link><suffix>` into a property value, so a command that edits at a cursor serves none of them.
 * Both ends of that shape are exercised here: picking a row yields the prefixed link, and DECLINING one
 * yields the empty string rather than a dangling `Person: ` — the behavior change that replaced
 * `inlineField`, and the reason a template can offer an OPTIONAL link at all.
 *
 * The record is read STRUCTURALLY out of the shared registry rather than through `watchPluginApi`, for two
 * reasons. The weak one: `lib` inside an `evalInObsidian` closure carries only the harness's own base
 * helpers unless the repo seeds `obsidian-dev-utils`' integration-test harness plugin, and that plugin
 * cannot load on Android at all — which would cost this suite its Android half. The strong
 * one: a structural read is the STRICTER test. Every plugin bundles its own `obsidian-dev-utils`, so a
 * registry record is a wire format between different library versions, and nothing crossing it may be
 * `instanceof`-checked. A reader with no copy of the library at all — which is exactly what this closure
 * is — proves that guarantee in a way a reader using the same copy as the provider never could.
 *
 * Cross-platform: the row and the control are CLICKED, because the harness drives keys through
 * Electron's input API and Android has not got one.
 *
 * **The waiting happens in NODE, and each closure below is milliseconds of DOM reading.** A single
 * `evalInObsidian` closure is capped at ~30s by the transport, so the five waits this flow declared
 * shared one budget none of them could have. That forces the one thing this file could not do before:
 * `select` settles only once something has been picked, several host round trips after the call that
 * opened the picker, so its promise CANNOT be awaited in the closure that started it. A `ContextId` is
 * what carries it across — the harness's own mechanism for state that must survive between closures —
 * and the answer is polled for out here.
 */

const PLUGIN_ID = 'link-picker';

const CONTROL_SELECTOR = '.modal-command';
const PROMPT_SELECTOR = '.prompt';
const ROW_SELECTOR = '.suggestion-item';

/**
 * The prefix and suffix the decline tests pass. A property list wants the `Person: ` shape; the suffix is
 * here only so a test asserting that BOTH survive can tell them apart.
 */
const PREFIX = 'Person: ';
const SUFFIX = '(unknown)';

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

interface ApiLike {
  select(params: SelectParamsLike): Promise<string>;
}

/**
 * Where the picker's answer waits, on the shared context rather than in a closure variable.
 *
 * `select` settles long after the call that opened the picker returned, so the string is stashed and
 * polled for from Node once a row or a control has ended the picker.
 */
interface ApiSuiteContext {
  isSettled?: boolean;
  link?: null | string;
  pending?: Promise<void>;
}

interface RecordLike {
  readonly api: ApiLike;
  readonly apiVersion: string;
  readonly isRevoked: boolean;
}

interface RegistryLike {
  readonly records: Record<string, RecordLike[] | undefined>;
}

/**
 * The answer, as this test reads it back off the shared context.
 */
interface SelectAnswer {
  readonly isSettled: boolean;
  readonly link: null | string;
}

/**
 * Only the options these tests pass. Declared HERE rather than imported from the plugin — that is what a
 * real consumer has, and sharing the plugin's own type would quietly test the two sides against one
 * declaration instead of two. Type-only, so none of it crosses into the closure at runtime, which is why
 * it can sit at module scope while every VALUE the closure needs still has to arrive through `input`.
 */
interface SelectParamsLike {
  readonly initialQuery?: string;
  readonly prefix?: string;
  readonly shouldApplyPrefixSuffixWhenNoLinkSelected?: boolean;
  readonly suffix?: string;
}

interface StateBagWindow {
  readonly __obsidianDevUtils?: Record<string, StateEntryLike | undefined>;
}

interface StateEntryLike {
  readonly value?: RegistryLike;
}

describe('The published API', () => {
  it('opens the picker for a consumer holding nothing but the registry record, and resolves with the link text', async () => {
    const stamp = `${Date.now().toString()}-${Math.floor(Math.random() * 1000).toString()}`;

    // At the vault root, because that is where the picker opens with no folder given.
    const targetName = `Ada-${stamp}`;

    await pollInObsidian({
      input: { targetName },
      poll({ app, targetName: name }): boolean {
        return app.vault.getFileByPath(`${name}.md`) !== null;
      },
      async start({ lib: { createNote }, targetName: name }): Promise<void> {
        await createNote({
          content: '# Ada\n',
          path: `${name}.md`
        });
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the staged note never appeared in the vault',
      until: (isPresent: boolean): boolean => isPresent
    });

    await pollNoPickerOpen();
    await pollApiPublished();
    const apiVersion = await readApiVersion();

    const contextId = new ContextId<ApiSuiteContext>();

    try {
      await startSelect(contextId, { initialQuery: targetName, prefix: PREFIX });
      const wasPickerOpened = await checkPickerOpen();

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
          // Addressed by TEXT rather than by position, so a row the vault happens to also match cannot be picked by mistake.
          const row = [...document.querySelectorAll(rowSelector)].find((el) => el.textContent.includes(name));
          if (!(row instanceof HTMLElement)) {
            throw new TypeError('The picked note was not offered.');
          }

          row.click();
        },
        input: { rowSelector: ROW_SELECTOR, targetName }
      });

      const link = await pollSelectAnswer(contextId);
      await checkPickerClosed();

      expect(wasPickerOpened).toBe(true);
      expect(apiVersion).toMatch(/^1\./);

      // The prefix is the whole shape the templates depend on: the result drops straight into a note's property list as `Person: [[Ada]]`.
      expect(link).toMatch(/^Person: /);
      expect(link).toContain('Ada-');
      expect(link).toMatch(/\[\[|]\(/);
    } finally {
      await contextId.dispose();
    }
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('drops the prefix and the suffix when the consumer declines a link', async () => {
    const result = await declineLink(false);

    expect(result.wasPickerClosed).toBe(true);

    // The point of the whole rework: an optional link that was declined leaves NOTHING behind.
    // The retired `inlineField` wrote a `Person: ` with nothing after it into the property list.
    expect(result.link).toBe('');
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('keeps the prefix and the suffix when the consumer asks for them regardless', async () => {
    const result = await declineLink(true);

    expect(result.wasPickerClosed).toBe(true);

    // The escape hatch for a document that needs the key present whatever the answer was.
    expect(result.link).toBe(`${PREFIX}${SUFFIX}`);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});

/**
 * The result a decline test reads back.
 */
interface DeclineResult {
  readonly link: null | string;
  readonly wasPickerClosed: boolean;
}

/**
 * Waits for the picker to be gone.
 *
 * @returns Whether it is, which is always `true` when this resolves rather than throwing.
 */
async function checkPickerClosed(): Promise<boolean> {
  return await pollInObsidian({
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
 * Reads whether a picker is on screen right now, without waiting for one.
 *
 * @returns Whether one is.
 */
async function checkPickerOpen(): Promise<boolean> {
  return await evalInObsidian({
    callback({ promptSelector }): boolean {
      return document.querySelector(promptSelector) !== null;
    },
    input: { promptSelector: PROMPT_SELECTOR }
  });
}

/**
 * Opens the picker through the published API with a prefix and a suffix, declines the link by CLICKING
 * `No link`, and resolves with what the API handed back.
 *
 * Shared by the two decline tests, which differ in exactly one boolean. Clicking `No link` is itself a way
 * of picking something, so each of them still leaves the shared Obsidian with no picker open.
 *
 * @param shouldApplyPrefixSuffixWhenNoLinkSelected - Whether the caller wants the prefix and the suffix
 * emitted even though no link was chosen.
 * @returns The string the API returned, and whether the picker closed behind it.
 */
async function declineLink(shouldApplyPrefixSuffixWhenNoLinkSelected: boolean): Promise<DeclineResult> {
  await pollNoPickerOpen();
  await pollApiPublished();

  const contextId = new ContextId<ApiSuiteContext>();

  try {
    await startSelect(contextId, {
      prefix: PREFIX,
      shouldApplyPrefixSuffixWhenNoLinkSelected,
      suffix: SUFFIX
    });

    // The settle and the click stay in ONE closure: the strip is rebuilt on every `update()`.
    // A re-render landing between reading the control and clicking it would click a detached button.
    await evalInObsidian({
      async callback({ controlSelector, label, renderDelayInMilliseconds }): Promise<void> {
        await sleep(renderDelayInMilliseconds);

        // Addressed by its LABEL rather than by position, so reordering the strip cannot silently retarget the click.
        const buttonEl = [...document.querySelectorAll(controlSelector)]
          .find((el) => el.querySelector('span')?.textContent === label);
        if (!(buttonEl instanceof HTMLElement)) {
          throw new TypeError(`No control labelled ${label}.`);
        }

        buttonEl.click();
      },
      input: {
        controlSelector: CONTROL_SELECTOR,
        label: 'No link',
        renderDelayInMilliseconds: RENDER_DELAY_IN_MILLISECONDS
      }
    });

    const link = await pollSelectAnswer(contextId);
    const wasPickerClosed = await checkPickerClosed();

    return { link, wasPickerClosed };
  } finally {
    await contextId.dispose();
  }
}

/**
 * Waits for the plugin to have published its API record into the shared registry.
 */
async function pollApiPublished(): Promise<void> {
  await pollInObsidian({
    input: { pluginId: PLUGIN_ID },
    poll({ pluginId }): boolean {
      // `window`, not `globalThis`, only because a lint rule forbids the latter.
      // In the renderer they are the same realm global the library writes its shared state onto.
      const registry = (window as StateBagWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
      return registry?.records[pluginId]?.some((candidate) => !candidate.isRevoked) ?? false;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the plugin never published its API',
    until: (isPublished: boolean): boolean => isPublished
  });
}

/**
 * Asserts the shared Obsidian was handed over with no picker open.
 *
 * These suites share one Obsidian, and each ends by picking something rather than by walking away, so a
 * picker still open here means an earlier suite broke that contract.
 */
async function pollNoPickerOpen(): Promise<void> {
  await pollInObsidian({
    input: { promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) === null;
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'a picker was left open by an earlier suite',
    until: (isClosed: boolean): boolean => isClosed
  });
}

/**
 * Polls the shared context until `select` has settled, and returns what it settled with.
 *
 * @param contextId - The context `select`'s answer was stashed on.
 * @returns The link the API handed back.
 */
async function pollSelectAnswer(contextId: ContextId<ApiSuiteContext>): Promise<null | string> {
  const answer = await pollInObsidian({
    contextId,
    poll({ context }): SelectAnswer {
      return {
        isSettled: context.isSettled ?? false,
        link: context.link ?? null
      };
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the API never resolved',
    until: (result: SelectAnswer): boolean => result.isSettled
  });

  return answer.link;
}

/**
 * @returns The `apiVersion` the live record declares.
 */
async function readApiVersion(): Promise<string> {
  return await evalInObsidian({
    callback({ pluginId }): string {
      const registry = (window as StateBagWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
      const record = registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
      if (!record) {
        throw new TypeError(`No API record was published for "${pluginId}".`);
      }

      return record.apiVersion;
    },
    input: { pluginId: PLUGIN_ID }
  });
}

/**
 * Calls `select` through the published API without awaiting it, stashing the answer on the shared
 * context, and waits for the picker it opens.
 *
 * Deliberately not awaited inside the closure: `select` settles only once a row or a control has ended
 * the picker, which is several host round trips away.
 * The promise is kept on the context so it is handled rather than floating.
 *
 * @param contextId - The context the answer is stashed on.
 * @param params - What the consumer asks `select` for.
 */
async function startSelect(contextId: ContextId<ApiSuiteContext>, params: SelectParamsLike): Promise<void> {
  await pollInObsidian({
    contextId,
    input: { params, pluginId: PLUGIN_ID, promptSelector: PROMPT_SELECTOR },
    poll({ promptSelector }): boolean {
      return document.querySelector(promptSelector) !== null;
    },
    start({ context, params: selectParams, pluginId }): void {
      const registry = (window as StateBagWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
      const record = registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
      if (!record) {
        throw new TypeError(`No API record was published for "${pluginId}".`);
      }

      context.isSettled = false;
      context.link = null;
      context.pending = record.api.select(selectParams)
        .then((link: string) => {
          context.link = link;
          context.isSettled = true;
        })
        .catch(() => {
          context.link = null;
          context.isSettled = true;
        });
    },
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the picker never opened',
    until: (isOpen: boolean): boolean => isOpen
  });
}

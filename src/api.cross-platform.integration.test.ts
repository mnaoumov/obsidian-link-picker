import { evalInObsidian } from 'obsidian-integration-testing';
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
 * cannot load on Android at all (T725-P1) — which would cost this suite its Android half. The strong
 * one: a structural read is the STRICTER test. Every plugin bundles its own `obsidian-dev-utils`, so a
 * registry record is a wire format between different library versions, and nothing crossing it may be
 * `instanceof`-checked. A reader with no copy of the library at all — which is exactly what this closure
 * is — proves that guarantee in a way a reader using the same copy as the provider never could.
 *
 * Cross-platform (G47): the row and the control are CLICKED, because the harness drives keys through
 * Electron's input API and Android has not got one.
 */

const PLUGIN_ID = 'link-picker';

/**
 * The prefix and suffix the decline tests pass. A property list wants the `Person: ` shape; the suffix is
 * here only so a test asserting that BOTH survive can tell them apart.
 */
const PREFIX = 'Person: ';
const SUFFIX = '(unknown)';

/**
 * The flow waits on the record being published, then on the picker opening, then on the row appearing,
 * each of which can legitimately take seconds on a cold Obsidian.
 */
const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

interface ApiLike {
  select(params: SelectParamsLike): Promise<string>;
}

interface ApiResult {
  readonly apiVersion: string;
  readonly link: string;
  readonly wasPickerOpened: boolean;
}

interface DeclineResult {
  readonly link: string;
  readonly wasPickerClosed: boolean;
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
    const result = await evalInObsidian({
      async callback({ lib: { createNote, waitUntil }, pluginId }): Promise<ApiResult> {
        const RENDER_DELAY_IN_MILLISECONDS = 400;
        const OPEN_TIMEOUT_IN_MILLISECONDS = 30_000;
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;

        // At the vault root, because that is where the picker opens with no folder given.
        const targetName = `Ada-${stamp}`;
        await createNote({
          content: '# Ada\n',
          path: `${targetName}.md`
        });

        // These suites share one Obsidian, and each ends by picking something rather than by walking
        // Away, so a picker still open here means an earlier suite broke that contract.
        await waitUntil({
          message: 'no picker left open by an earlier suite',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });

        await waitUntil({
          message: 'the plugin published its API',
          predicate: () => findRecord() !== undefined,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });

        const record = findRecord();
        if (!record) {
          throw new TypeError(`No API record was published for "${pluginId}".`);
        }

        // Not awaited yet: `select` opens the picker and settles only once something is picked, so the
        // Driving below has to happen while this promise is still pending.
        const linkPromise = record.api.select({
          initialQuery: targetName,
          prefix: 'Person: '
        });

        await waitUntil({
          message: 'the picker is open',
          predicate: () => document.querySelector('.prompt') !== null,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });
        await sleep(RENDER_DELAY_IN_MILLISECONDS);
        const wasPickerOpened = document.querySelector('.prompt') !== null;

        await waitUntil({
          message: 'the picked note is offered',
          predicate: () => [...document.querySelectorAll('.suggestion-item')].some((el) => el.textContent.includes(targetName)),
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });

        // Addressed by TEXT rather than by position, so a row the vault happens to also match cannot be
        // Picked by mistake.
        const row = [...document.querySelectorAll('.suggestion-item')].find((el) => el.textContent.includes(targetName));
        if (!(row instanceof HTMLElement)) {
          throw new TypeError('The picked note was not offered.');
        }
        row.click();

        const link = await linkPromise;
        await waitUntil({
          message: 'the picker closed',
          predicate: () => document.querySelector('.prompt') === null,
          timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
        });

        return {
          apiVersion: record.apiVersion,
          link,
          wasPickerOpened
        };

        function findRecord(): RecordLike | undefined {
          // `window`, not `globalThis`, only because a lint rule forbids the latter — in the renderer they
          // Are the same realm global the library writes its shared state onto.
          const registry = (window as StateBagWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
          return registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
        }
      },
      input: { pluginId: PLUGIN_ID }
    });

    expect(result.wasPickerOpened).toBe(true);
    expect(result.apiVersion).toMatch(/^1\./);

    // The prefix is the whole shape the templates depend on: the result drops straight into
    // A note's property list as `Person: [[Ada]]`.
    expect(result.link).toMatch(/^Person: /);
    expect(result.link).toContain('Ada-');
    expect(result.link).toMatch(/\[\[|]\(/);
  }, TEST_TIMEOUT_IN_MILLISECONDS);

  it('drops the prefix and the suffix when the consumer declines a link', async () => {
    const result = await declineLink(false);

    expect(result.wasPickerClosed).toBe(true);

    // The point of the whole rework: an optional link that was declined leaves NOTHING behind, where the
    // Retired `inlineField` wrote a `Person: ` with nothing after it into the property list.
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
  return await evalInObsidian({
    async callback({ lib: { waitUntil }, pluginId, prefix, shouldApply, suffix }): Promise<DeclineResult> {
      const RENDER_DELAY_IN_MILLISECONDS = 400;
      const OPEN_TIMEOUT_IN_MILLISECONDS = 30_000;

      await waitUntil({
        message: 'no picker left open by an earlier suite',
        predicate: () => document.querySelector('.prompt') === null,
        timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
      });

      await waitUntil({
        message: 'the plugin published its API',
        predicate: () => findRecord() !== undefined,
        timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
      });

      const record = findRecord();
      if (!record) {
        throw new TypeError(`No API record was published for "${pluginId}".`);
      }

      // Pending on purpose, exactly as above: the control can only be clicked while the picker is open.
      const linkPromise = record.api.select({
        prefix,
        shouldApplyPrefixSuffixWhenNoLinkSelected: shouldApply,
        suffix
      });

      await waitUntil({
        message: 'the picker is open',
        predicate: () => document.querySelector('.prompt') !== null,
        timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
      });
      await sleep(RENDER_DELAY_IN_MILLISECONDS);

      clickControl('No link');

      const link = await linkPromise;
      await waitUntil({
        message: 'the picker closed',
        predicate: () => document.querySelector('.prompt') === null,
        timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
      });
      await sleep(RENDER_DELAY_IN_MILLISECONDS);

      return {
        link,
        wasPickerClosed: document.querySelector('.prompt') === null
      };

      /**
       * Addressed by its LABEL rather than by position, so reordering the strip cannot silently retarget
       * the click.
       *
       * @param label - The control's visible label.
       */
      function clickControl(label: string): void {
        const buttonEl = [...document.querySelectorAll('.modal-command')]
          .find((el) => el.querySelector('span')?.textContent === label);
        if (!(buttonEl instanceof HTMLElement)) {
          throw new TypeError(`No control labelled ${label}.`);
        }
        buttonEl.click();
      }

      /**
       * @returns The plugin's live API record, read structurally out of the shared registry.
       */
      function findRecord(): RecordLike | undefined {
        const registry = (window as StateBagWindow).__obsidianDevUtils?.['pluginApiRegistry']?.value;
        return registry?.records[pluginId]?.find((candidate) => !candidate.isRevoked);
      }
    },
    input: {
      pluginId: PLUGIN_ID,
      prefix: PREFIX,
      shouldApply: shouldApplyPrefixSuffixWhenNoLinkSelected,
      suffix: SUFFIX
    }
  });
}

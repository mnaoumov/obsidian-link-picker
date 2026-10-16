import type { ApiContract } from '@mnaoumov/typescript-lib/api-contract';

import type {
  LinkPickerApi as LinkPickerApiDeclaration,
  LinkPickerApiSelectParams
} from '../api.d.ts';
import type { LinkPickerComponent } from './link-picker-component.ts';

import { LINK_PICKER_API_CONTRACT as COPYABLE_LINK_PICKER_API_CONTRACT } from '../api-contract.ts';

/**
 * The version of the API {@link LINK_PICKER_API_CONTRACT} describes.
 *
 * This is the CONTRACT version, and it is independent of the plugin's own `manifest.version` — the plugin
 * may reach `2.0.0` while still exposing this API unchanged, and this may reach `2.0.0` while the plugin
 * does not. Consumers pin a range against this one, not against the plugin.
 */
export const LINK_PICKER_API_VERSION = '1.1.0';

/**
 * The contract {@link LINK_PICKER_API_VERSION} of the API satisfies.
 *
 * @remarks
 * The repo-root `api-contract.ts` constant a consumer copies, so the provider and its consumers validate
 * against one definition. Assigning it here is also what checks that the hand-written schemas are Standard
 * Schemas the registry accepts.
 */
export const LINK_PICKER_API_CONTRACT: ApiContract<LinkPickerApiDeclaration> = COPYABLE_LINK_PICKER_API_CONTRACT;

/**
 * What the plugin publishes for other plugins and scripts to call.
 *
 * @remarks
 * The shape is declared ONCE, in the repo-root `api.d.ts`, which this implements. That file imports from
 * `obsidian` and nothing else, so a consumer can copy it whole without acquiring a dependency on this
 * plugin or on `@mnaoumov/obsidian-lib` — which is the point of it, the plugin not being published to npm.
 * {@link LINK_PICKER_API_CONTRACT} is what actually checks the two sides agree at runtime.
 *
 * A thin delegate rather than the {@link LinkPickerComponent} itself, because publishing the component
 * would publish `load`, `unload` and the rest of the `Component` surface as though they were API, and
 * every one of them would then be something consumers could come to depend on.
 */
export class LinkPickerApi implements LinkPickerApiDeclaration {
  public constructor(private readonly linkPickerComponent: LinkPickerComponent) {}

  /**
   * Opens the picker and resolves with the chosen link text.
   *
   * @param params - Per-call options; anything omitted comes from the plugin's settings.
   * @returns The link text. Rejects when the user dismisses the picker without choosing.
   */
  public async select(params: LinkPickerApiSelectParams): Promise<string> {
    return await this.linkPickerComponent.select(params);
  }
}

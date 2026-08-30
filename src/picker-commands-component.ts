import type { App } from 'obsidian';
import type { DisposableEx } from 'obsidian-dev-utils/disposable';
import type { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { isDeepEqual } from 'obsidian-dev-utils/object-utils';
import { registerAsyncEvent } from 'obsidian-dev-utils/obsidian/components/async-events-component';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import type { LinkPickerComponent } from './link-picker-component.ts';
import type {
  Picker,
  PluginSettings
} from './plugin-settings.ts';

import { InsertLinkEditorCommandHandler } from './command-handlers/insert-link-editor-command-handler.ts';

interface PickerCommandsComponentConstructorParams {
  readonly app: App;
  readonly commandHandlerComponent: CommandHandlerComponent;
  readonly linkPickerComponent: LinkPickerComponent;
  readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
}

/**
 * Keeps one command registered per configured picker.
 *
 * The generic `Insert link...` command is registered once by the plugin and never changes; these come
 * and go with the settings, so they need an owner that can take them away again.
 * {@link CommandHandlerComponent.registerCommandHandlers} returns a handle that unregisters exactly the
 * commands that call added, which is what makes re-registration a dispose-and-register rather than a
 * reload of the plugin.
 */
export class PickerCommandsComponent extends ComponentEx {
  private readonly app: App;
  private readonly commandHandlerComponent: CommandHandlerComponent;
  private readonly linkPickerComponent: LinkPickerComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
  private registeredPickers: readonly Picker[] = [];
  private registration: DisposableEx | null = null;

  public constructor(params: PickerCommandsComponentConstructorParams) {
    super();
    this.app = params.app;
    this.commandHandlerComponent = params.commandHandlerComponent;
    this.linkPickerComponent = params.linkPickerComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override async onloadAsync(): Promise<void> {
    // Both events, because the settings reach this component by two different routes: a save is the
    // Settings tab writing, and a load is `data.json` changing under Obsidian — a sync client, or the
    // User editing the file by hand.
    for (const eventName of ['loadSettings', 'saveSettings'] as const) {
      registerAsyncEvent(
        this,
        this.pluginSettingsComponent.on(eventName, async () => {
          await this.refreshCommandsIfChanged();
        })
      );
    }

    await this.refreshCommands();
  }

  /**
   * Tears down the commands of the previous picker list and registers the current one.
   */
  private async refreshCommands(): Promise<void> {
    this.registration?.dispose();

    const pickers = this.pluginSettingsComponent.settings.pickers;
    this.registeredPickers = pickers;
    this.registration = await this.commandHandlerComponent.registerCommandHandlers(() =>
      pickers.map((picker) =>
        new InsertLinkEditorCommandHandler({
          app: this.app,
          linkPickerComponent: this.linkPickerComponent,
          picker
        })
      )
    );
  }

  /**
   * Re-registers only when the picker list actually changed.
   *
   * Every settings save fires this, and most of them change something else entirely — the folder-note
   * location, an excluded path. Re-registering regardless would remove and re-add every picker command
   * on each keystroke in an unrelated field, and a command that is momentarily absent is a command
   * whose hotkey momentarily does nothing.
   */
  private async refreshCommandsIfChanged(): Promise<void> {
    if (isDeepEqual(this.registeredPickers, this.pluginSettingsComponent.settings.pickers)) {
      return;
    }

    await this.refreshCommands();
  }
}

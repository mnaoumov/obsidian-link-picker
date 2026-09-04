import type {
  App,
  PluginManifest
} from 'obsidian';

import { Component as ComponentCls } from 'obsidian';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { watchPluginApi } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';
import { App as AppCls } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface ComponentModuleActual {
  Component: new () => object;
}

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

vi.mock('./link-picker-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class LinkPickerComponent extends Component {}
  return { LinkPickerComponent };
});

vi.mock('./picker-commands-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class PickerCommandsComponent extends Component {}
  return { PickerCommandsComponent };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  LINK_PICKER_API_CONTRACT,
  LINK_PICKER_API_VERSION,
  LinkPickerApi
} from './link-picker-api.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkPickerComponent } from './link-picker-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PickerCommandsComponent } from './picker-commands-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

const PLUGIN_MANIFEST: PluginManifest = {
  author: 'mnaoumov',
  description: 'test',
  id: 'link-picker',
  minAppVersion: '1.0.0',
  name: 'Link Picker',
  version: '1.0.0'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Plugin', () => {
  it('should add the settings component, the settings tab and the picker', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
    expect(addedChildren.some((child) => child instanceof PluginSettingsComponent)).toBe(true);
    expect(addedChildren.some((child) => child instanceof PluginSettingsTabComponent)).toBe(true);
    expect(addedChildren.some((child) => child instanceof LinkPickerComponent)).toBe(true);
    plugin.unload();
  });

  it('should own the per-picker commands through their own component, so they can come and go', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    expect(addChildSpy.mock.calls.map((call) => call[0]).some((child) => child instanceof PickerCommandsComponent)).toBe(true);
    plugin.unload();
  });

  it('should publish the API, and take it away again when the plugin unloads', async () => {
    // Through the REAL registry rather than a spy on `publishPluginApi`: what matters is that a consumer
    // Watching in the ordinary way finds the API, which mocking the publish would assert nothing about.
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const component = new ComponentCls();
    const ref = watchPluginApi<LinkPickerApi>({
      apiVersionRange: `^${LINK_PICKER_API_VERSION}`,
      app: plugin.app,
      component,
      contract: LINK_PICKER_API_CONTRACT,
      pluginId: PLUGIN_MANIFEST.id
    });

    // The watch is opened BEFORE the provider loads, which is the case that breaks a one-shot lookup:
    // `null` here means "not yet", and the ref becomes non-null on its own.
    expect(ref.value).toBeNull();

    // `load()` rather than a bare `onload()`, so the plugin is really LOADED and `unload()` below is not
    // A no-op. It does not await, hence the wait.
    plugin.load();
    await vi.waitFor(() => {
      expect(typeof ref.value?.select).toBe('function');
    });

    plugin.unload();

    // `publishPluginApi` registered the revocation itself, so nothing here had to tear it down.
    expect(ref.value).toBeNull();
    component.unload();
  });

  it('should register the generic insert command and the demo-vault command itself', async () => {
    const registerCommandHandlers = vi.spyOn(CommandHandlerComponent.prototype, 'registerCommandHandlers');
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();

    // The base class registers its own commands first, so the plugin's own batch is the last one.
    const factory = registerCommandHandlers.mock.calls.at(-1)?.[0];
    expect(factory?.().map((handler) => handler.buildCommand().id)).toEqual(['insert-link', 'open-demo-vault']);
    plugin.unload();
  });
});

function createConfiguredApp(): App {
  const appMock = AppCls.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  return appMock.asOriginalType__();
}

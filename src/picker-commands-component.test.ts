import type { App } from 'obsidian';
import type { DisposableEx } from 'obsidian-dev-utils/disposable';
import type { CommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler';
import type { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinkPickerComponent } from './link-picker-component.ts';
import type {
  Picker,
  PluginSettings
} from './plugin-settings.ts';

import { PickerCommandsComponent } from './picker-commands-component.ts';
import {
  createPicker,
  PluginSettings as PluginSettingsClass
} from './plugin-settings.ts';

type SaveSettingsListener = () => Promise<void>;

let dispose: ReturnType<typeof vi.fn>;
let registerCommandHandlers: ReturnType<typeof vi.fn>;
let saveSettingsListeners: SaveSettingsListener[];
let settings: PluginSettings;

beforeEach(() => {
  vi.clearAllMocks();
  dispose = vi.fn();
  saveSettingsListeners = [];
  settings = new PluginSettingsClass();
  registerCommandHandlers = vi.fn(() => Promise.resolve(strictProxy<DisposableEx>({ dispose: castTo<DisposableEx['dispose']>(dispose) })));
});

describe('PickerCommandsComponent', () => {
  it('should register nothing when no picker is configured', async () => {
    await createLoadedComponent();

    expect(builtCommandIds()).toEqual([]);
  });

  it('should register one command per configured picker', async () => {
    settings.pickers = [namedPicker('People'), namedPicker('Courts')];

    await createLoadedComponent();

    expect(builtCommandNames()).toEqual(['People', 'Courts']);
  });

  it('should build a fresh handler for every menu surface, since a handler carries per-registration state', async () => {
    settings.pickers = [namedPicker('People')];
    await createLoadedComponent();

    const factory = lastFactory();

    expect(factory()[0]).not.toBe(factory()[0]);
  });

  it('should take the old commands away before registering the new ones', async () => {
    settings.pickers = [namedPicker('People')];
    await createLoadedComponent();

    settings.pickers = [namedPicker('Courts')];
    await notifySettingsSaved();

    expect(dispose).toHaveBeenCalledOnce();
    expect(builtCommandNames()).toEqual(['Courts']);
  });

  it('should register the picker added since the last save', async () => {
    settings.pickers = [namedPicker('People')];
    await createLoadedComponent();

    settings.pickers = [...settings.pickers, namedPicker('Courts')];
    await notifySettingsSaved();

    expect(builtCommandNames()).toEqual(['People', 'Courts']);
  });

  it('should leave the commands alone when a save changed something else entirely', async () => {
    settings.pickers = [namedPicker('People')];
    await createLoadedComponent();

    settings.excludedPathPatterns = ['/attachments'];
    await notifySettingsSaved();

    expect(registerCommandHandlers).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('should re-register when a picker is edited in place, not only when one is added', async () => {
    const picker = namedPicker('People');
    settings.pickers = [picker];
    await createLoadedComponent();

    const renamed = namedPicker('Humans');
    renamed.id = picker.id;
    settings.pickers = [renamed];
    await notifySettingsSaved();

    expect(builtCommandNames()).toEqual(['Humans']);
  });
});

function builtCommandIds(): string[] {
  return lastFactory()().map((handler) => handler.buildCommand().id);
}

function builtCommandNames(): string[] {
  return lastFactory()().map((handler) => handler.buildCommand().name);
}

async function createLoadedComponent(): Promise<PickerCommandsComponent> {
  const component = new PickerCommandsComponent({
    app: strictProxy<App>({}),
    commandHandlerComponent: strictProxy<CommandHandlerComponent>({ registerCommandHandlers: castTo<CommandHandlerComponent['registerCommandHandlers']>(registerCommandHandlers) }),
    linkPickerComponent: strictProxy<LinkPickerComponent>({ select: vi.fn(() => Promise.resolve('')) }),
    pluginSettingsComponent: strictProxy<PluginSettingsComponentBase<PluginSettings>>({
      on: castTo<PluginSettingsComponentBase<PluginSettings>['on']>(vi.fn((name: string, callback: SaveSettingsListener) => {
        if (name === 'saveSettings') {
          saveSettingsListeners.push(callback);
        }

        return { asyncEventSource: { offref: vi.fn() } };
      })),
      get settings() {
        return settings;
      }
    })
  });
  await component.loadWithPromises();
  return component;
}

function lastFactory(): () => CommandHandler[] {
  const call = registerCommandHandlers.mock.calls.at(-1);

  if (!call) {
    throw new Error('No commands were ever registered.');
  }

  return castTo<() => CommandHandler[]>(call[0]);
}

function namedPicker(name: string): Picker {
  const picker = createPicker();
  picker.name = name;
  return picker;
}

async function notifySettingsSaved(): Promise<void> {
  for (const listener of saveSettingsListeners) {
    await listener();
  }
}

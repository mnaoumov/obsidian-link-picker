import type { AsyncEventRef } from 'obsidian-dev-utils/async-events';
import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Picker } from './plugin-settings.ts';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { createPicker } from './plugin-settings.ts';

describe('PluginSettingsComponent', () => {
  it('should default to no pickers', async () => {
    const component = await createLoadedComponent();

    expect(component.settings.pickers).toEqual([]);
  });

  it('should accept a list of distinct, named pickers', async () => {
    const component = await createLoadedComponent();

    expect(await component.setProperty('pickers', [namedPicker('People'), namedPicker('Courts')])).toBe('');
    expect(component.settings.pickers).toHaveLength(2);
  });

  it('should reject a picker with no name, because the name is what its command is called', async () => {
    const component = await createLoadedComponent();

    expect(await component.setProperty('pickers', [namedPicker('')])).toBe('Every picker needs a name — it is what its command is called.');
  });

  it('should reject two pickers sharing a name', async () => {
    const component = await createLoadedComponent();

    expect(await component.setProperty('pickers', [namedPicker('People'), namedPicker('People')]))
      .toBe('Two pickers are both named "People". Names become command names, so they have to differ.');
  });

  it('should reject a hand-written picker that never got an id', async () => {
    const component = await createLoadedComponent();
    const picker = namedPicker('People');
    picker.id = '';

    expect(await component.setProperty('pickers', [picker]))
      .toBe('Picker "People" has no id. Add pickers here rather than by hand-editing data.json.');
  });

  it('should reject two pickers sharing an id, since ids are what hotkeys bind to', async () => {
    const component = await createLoadedComponent();
    const first = namedPicker('People');
    const second = namedPicker('Courts');
    second.id = first.id;

    expect(await component.setProperty('pickers', [first, second]))
      .toBe('Picker "Courts" reuses another picker\'s id. Ids are what hotkeys are bound to, so they have to differ.');
  });

  it('should fall back to no pickers at all when the list is rejected, rather than registering half of it', async () => {
    const component = await createLoadedComponent();

    await component.setProperty('pickers', [namedPicker('People'), namedPicker('')]);

    expect(component.settings.pickers).toEqual([]);
    expect(component.settingsState.inputValues.pickers).toHaveLength(2);
  });
});

async function createLoadedComponent(): Promise<PluginSettingsComponent> {
  const component = new PluginSettingsComponent({
    dataHandler: strictProxy<DataHandler>({
      loadData: vi.fn(() => Promise.resolve(null)),
      saveData: vi.fn(() => noopAsync())
    }),
    pluginEventSource: createMockPluginEventSource()
  });
  await component.loadWithPromises();
  return component;
}

function createMockPluginEventSource(): PluginEventSource {
  const source: PluginEventSource = strictProxy<PluginEventSource>({
    offref: noop,
    on(name: string, callback: () => void, thisArgument?: unknown): AsyncEventRef {
      return {
        asyncEventSource: source,
        callback,
        name,
        thisArgument
      };
    }
  });
  return source;
}

function namedPicker(name: string): Picker {
  const picker = createPicker();
  picker.name = name;
  return picker;
}

/**
 * @file
 *
 * Offers a configured picker while its trigger is typed in a note.
 *
 * The trigger detection, the suggest's dismissal memory and its re-check of what is still typed are adapted from
 * `Note Compass` (`src/mentions/suggest.ts`, https://github.com/carlesba/obsidian-note-compass), MIT; its copyright
 * line and license text are in `./trigger.ts`.
 */

import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type {
  App,
  Editor,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile
} from 'obsidian';

import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { EditorSuggest } from 'obsidian';

import type { LinkPickerComponent } from '../picker/link-picker-component.ts';
import type {
  Picker,
  PluginSettings
} from '../settings/plugin-settings.ts';
import type { TriggerMatch } from './trigger.ts';

import { getPickerSelectParams } from '../command-handlers/picker-select-params.ts';
import {
  findTrigger,
  isInCodeOrFrontmatter
} from './trigger.ts';

/**
 * The one row the suggest shows: the picker the trigger belongs to, and what was typed after it.
 */
export interface PickerTriggerSuggestion {
  readonly picker: Picker;
  readonly query: string;
}

interface PickerTriggerEditorSuggestConstructorParams {
  readonly app: App;
  readonly linkPickerComponent: LinkPickerComponent;
  readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;
}

/**
 * Offers a configured picker while its trigger is typed, and opens it on `Enter`.
 *
 * It deliberately shows ONE row rather than a list of notes: the full picker, with its folder navigation, toggles and
 * `Create new`, is what the row opens, seeded with what was typed after the trigger. `Space` ends the trigger, and
 * `Escape` dismisses it for that position, so in both cases the text stays exactly as typed.
 */
export class PickerTriggerEditorSuggest extends EditorSuggest<PickerTriggerSuggestion> {
  /**
   * Where the user dismissed a trigger with `Escape`, as `<path>:<line>:<ch>`, so it does not pop up again while the
   * user keeps typing after it.
   */
  private dismissedPositionKey: null | string = null;

  private readonly linkPickerComponent: LinkPickerComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponentBase<PluginSettings>;

  public constructor(params: PickerTriggerEditorSuggestConstructorParams) {
    super(params.app);
    this.linkPickerComponent = params.linkPickerComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override close(): void {
    const context = this.context;

    if (context && this.isStillTyped(context)) {
      this.dismissedPositionKey = getPositionKey(context.file, context.start);
    }

    super.close();
  }

  public override getSuggestions(context: EditorSuggestContext): PickerTriggerSuggestion[] {
    const match = this.findTypedTrigger(context.editor, context.start.line, context.end.ch);
    return match ? [{ picker: match.owner, query: context.query }] : [];
  }

  public override onTrigger(cursor: EditorPosition, editor: Editor, file: null | TFile): EditorSuggestTriggerInfo | null {
    if (!file) {
      return null;
    }

    const match = this.findTypedTrigger(editor, cursor.line, cursor.ch);

    if (!match) {
      this.dismissedPositionKey = null;
      return null;
    }

    const start: EditorPosition = { ch: match.start, line: cursor.line };

    if ((getPositionKey(file, start) === this.dismissedPositionKey) || isInCodeOrFrontmatter(getLinesAbove(editor, cursor.line), editor.getLine(cursor.line).slice(0, cursor.ch))) {
      return null;
    }

    this.setInstructions([
      { command: '↵', purpose: 'open the picker' },
      { command: 'esc', purpose: `keep ${match.owner.trigger}` }
    ]);

    return { end: cursor, query: match.query, start };
  }

  public override renderSuggestion(suggestion: PickerTriggerSuggestion, el: HTMLElement): void {
    const contentEl = el.createDiv('suggestion-content');
    contentEl.createDiv({ cls: 'suggestion-title', text: suggestion.picker.name });
    contentEl.createDiv({
      cls: 'suggestion-note',
      text: suggestion.query ? `Search for "${suggestion.query}"` : 'Open the picker'
    });
  }

  public override selectSuggestion(suggestion: PickerTriggerSuggestion): void {
    const context = this.context;

    // Closed without remembering the position: the picker opening is not the user dismissing the trigger.
    super.close();

    if (!context) {
      return;
    }

    invokeAsyncSafely(async () => {
      await this.insertLink(suggestion, context);
    });
  }

  private findTypedTrigger(editor: Editor, line: number, ch: number): null | TriggerMatch<Picker> {
    return findTrigger(editor.getLine(line).slice(0, ch), this.pluginSettingsComponent.settings.pickers);
  }

  private async insertLink(suggestion: PickerTriggerSuggestion, context: EditorSuggestContext): Promise<void> {
    const typedText = context.editor.getRange(context.start, context.end);
    let link: string;

    try {
      link = await this.linkPickerComponent.select(getPickerSelectParams({
        initialQuery: suggestion.query,
        linkDisplayText: '',
        picker: suggestion.picker,
        sourcePathOrFile: context.file
      }));
    } catch {
      // Dismissing the picker rejects. That is the user declining, so the trigger stays as typed.
      return;
    }

    // The modal blocks typing, but a sync client or a script can still edit the note meanwhile; replacing a range
    // that no longer holds the trigger would overwrite someone else's text, so the link goes in at the caret instead.
    if (context.editor.getRange(context.start, context.end) !== typedText) {
      context.editor.replaceSelection(link);
      return;
    }

    context.editor.replaceRange(link, context.start, context.end);
  }

  private isStillTyped(context: EditorSuggestContext): boolean {
    const cursor = context.editor.getCursor();

    return cursor.line === context.start.line && this.findTypedTrigger(context.editor, cursor.line, cursor.ch)?.start === context.start.ch;
  }
}

function getLinesAbove(editor: Editor, line: number): string[] {
  const lines: string[] = [];

  for (let index = 0; index < line; index++) {
    lines.push(editor.getLine(index));
  }

  return lines;
}

function getPositionKey(file: TFile, position: EditorPosition): string {
  return `${file.path}:${String(position.line)}:${String(position.ch)}`;
}

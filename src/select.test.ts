import { noop } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { SelectParams } from './select.ts';

import { select } from './select.ts';

interface ModalConstructorParams {
  reject(this: void, reason: unknown): void;
  resolve(this: void, value: string): void;
}

const open = vi.fn();
let lastParams: ModalConstructorParams | null = null;

vi.mock('./link-picker-modal.ts', () => ({
  LinkPickerModal: class {
    public constructor(params: ModalConstructorParams) {
      lastParams = params;
    }

    public open(): void {
      open();
    }
  }
}));

describe('select', () => {
  it('should open the picker', () => {
    select(castTo<SelectParams>({})).catch(noop);

    expect(open).toHaveBeenCalledOnce();
  });

  it('should resolve with whatever the picker settled on', async () => {
    const promise = select(castTo<SelectParams>({}));

    lastParams?.resolve('Person: [[Ada]]');

    expect(await promise).toBe('Person: [[Ada]]');
  });

  it('should reject when the picker is dismissed, so a caller can tell that apart from an empty pick', async () => {
    const promise = select(castTo<SelectParams>({}));

    lastParams?.reject(new Error('No link selected'));

    await expect(promise).rejects.toThrow('No link selected');
  });
});

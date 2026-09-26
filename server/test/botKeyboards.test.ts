import { describe, expect, it } from 'vitest';
import { categoryKeyboard, confirmKeyboard } from '../src/bot/keyboards.js';
import { CATEGORY_LABEL, dict } from '../src/bot/i18n.js';

describe('confirmKeyboard', () => {
  it('высокая уверенность — обычные кнопки в одну строку', () => {
    const kb = confirmKeyboard('kk', 42, false);
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0]!.map((b) => b.style)).toEqual([undefined, undefined]);
    expect(kb.inline_keyboard[0]!.map((b) => b.text)).toEqual([dict.kk.btnOk, dict.kk.btnChange]);
  });

  it('низкая уверенность — цветные кнопки на отдельных строках', () => {
    const kb = confirmKeyboard('ru', 42, true);
    expect(kb.inline_keyboard).toHaveLength(2);
    expect(kb.inline_keyboard[0]![0]).toMatchObject({ callback_data: 'ok:42', style: 'success' });
    expect(kb.inline_keyboard[1]![0]).toMatchObject({ callback_data: 'chg:42', style: 'primary' });
  });
});

describe('categoryKeyboard', () => {
  it('все 7 категорий, callback_data в пределах 64 байт', () => {
    const kb = categoryKeyboard('kk', 999_999);
    const buttons = kb.inline_keyboard.flat();
    expect(buttons).toHaveLength(7);
    expect(buttons.map((b) => b.text)).toContain(CATEGORY_LABEL.OIL.kk);
    for (const b of buttons) {
      expect(Buffer.byteLength((b as { callback_data: string }).callback_data)).toBeLessThanOrEqual(
        64,
      );
    }
  });
});

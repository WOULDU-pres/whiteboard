import { describe, it, expect } from 'vitest';
import { applyCardChange } from './cards';
import type { Card } from './types';

const base: Card = {
  id: 'c1', board_id: 'b1', type: 'text', content: 'hi', image_url: null,
  x: 0, y: 0, width: 160, height: 160, color: '#fff3a0', owner_id: 'me',
  z_index: 0, created_at: 't', updated_at: 't',
};

describe('applyCardChange', () => {
  it('INSERT는 새 카드를 추가한다', () => {
    const out = applyCardChange([], { eventType: 'INSERT', card: base });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c1');
  });
  it('같은 id INSERT/UPDATE는 중복 없이 교체한다', () => {
    const out1 = applyCardChange([base], { eventType: 'INSERT', card: base });
    expect(out1).toHaveLength(1);
    const out2 = applyCardChange([base], { eventType: 'UPDATE', card: { ...base, content: 'bye' } });
    expect(out2).toHaveLength(1);
    expect(out2[0].content).toBe('bye');
  });
  it('DELETE는 해당 id를 제거한다', () => {
    const out = applyCardChange([base], { eventType: 'DELETE', id: 'c1' });
    expect(out).toHaveLength(0);
  });
  it('원본 배열을 변형하지 않는다', () => {
    const arr = [base];
    applyCardChange(arr, { eventType: 'DELETE', id: 'c1' });
    expect(arr).toHaveLength(1);
  });
});

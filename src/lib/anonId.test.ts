import { describe, it, expect } from 'vitest';
import { getAnonId } from './anonId';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('getAnonId', () => {
  it('처음 호출하면 새 ID를 만들어 저장한다', () => {
    const s = memStorage();
    const id = getAnonId(s);
    expect(id).toBeTruthy();
    expect(s.getItem('whiteboard_owner_id')).toBe(id);
  });

  it('두 번째 호출은 같은 ID를 반환한다', () => {
    const s = memStorage();
    const a = getAnonId(s);
    const b = getAnonId(s);
    expect(a).toBe(b);
  });
});

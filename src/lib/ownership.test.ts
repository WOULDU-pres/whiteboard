import { describe, it, expect } from 'vitest';
import { canEdit } from './ownership';

describe('canEdit', () => {
  it('내 카드면 true', () => {
    expect(canEdit({ owner_id: 'me' }, 'me')).toBe(true);
  });
  it('남의 카드면 false', () => {
    expect(canEdit({ owner_id: 'other' }, 'me')).toBe(false);
  });
  it('빈 myId는 항상 false', () => {
    expect(canEdit({ owner_id: '' }, '')).toBe(false);
  });
});

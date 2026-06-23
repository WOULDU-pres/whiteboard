import type { Card, CardChange } from './types';

export const PALETTE = ['#fff3a0', '#ffc7d9', '#bfe3ff', '#c8f5c8'];

export function applyCardChange(cards: Card[], change: CardChange): Card[] {
  if (change.eventType === 'DELETE') {
    return cards.filter((c) => c.id !== change.id);
  }
  const existing = cards.find((c) => c.id === change.card.id);
  // updated_at 기준 last-write-wins(spec §7·§11). UPDATE 에코가 순서가 뒤바뀌어
  // 도착해도(재연결 후 버퍼 flush 등) 더 오래된 값이 최신 값을 덮지 않게 가드한다.
  // 동일 timestamp는 도착한 쪽을 채택(=마지막 쓰기). INSERT는 무조건 반영.
  if (
    change.eventType === 'UPDATE' &&
    existing &&
    existing.updated_at > change.card.updated_at
  ) {
    return cards;
  }
  const without = cards.filter((c) => c.id !== change.card.id);
  return [...without, change.card];
}

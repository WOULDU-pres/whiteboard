import type { Card, CardChange } from './types';

export const PALETTE = ['#fff3a0', '#ffc7d9', '#bfe3ff', '#c8f5c8'];

export function applyCardChange(cards: Card[], change: CardChange): Card[] {
  if (change.eventType === 'DELETE') {
    return cards.filter((c) => c.id !== change.id);
  }
  const without = cards.filter((c) => c.id !== change.card.id);
  return [...without, change.card];
}

import type { Card } from './types';

export function canEdit(card: Pick<Card, 'owner_id'>, myId: string): boolean {
  return myId !== '' && card.owner_id === myId;
}

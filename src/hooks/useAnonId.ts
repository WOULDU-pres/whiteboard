import { useState } from 'react';
import { getAnonId } from '../lib/anonId';

export function useAnonId(): string {
  const [id] = useState(() => getAnonId());
  return id;
}

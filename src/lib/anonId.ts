const KEY = 'whiteboard_owner_id';

type MiniStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function getAnonId(storage: MiniStorage = window.localStorage): string {
  const existing = storage.getItem(KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(KEY, id);
  return id;
}

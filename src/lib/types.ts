export type CardType = 'text' | 'image';

export interface Card {
  id: string;
  board_id: string;
  type: CardType;
  content: string | null;
  image_url: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  owner_id: string;
  z_index: number;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  code: string;
  title: string;
  created_at: string;
}

export type CardChange =
  | { eventType: 'INSERT'; card: Card }
  | { eventType: 'UPDATE'; card: Card }
  | { eventType: 'DELETE'; id: string };

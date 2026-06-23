import { supabase } from './supabaseClient';
import type { Board, Card } from './types';
import { generateBoardCode } from './boardCode';
import { downscaleImage } from './image';

export type NewCard = Omit<Card, 'id' | 'created_at' | 'updated_at'>;

export async function createBoard(title: string): Promise<Board> {
  // 코드 충돌 시 몇 번 재시도
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateBoardCode();
    const { data, error } = await supabase
      .from('boards')
      .insert({ code, title: title || '제목 없는 보드' })
      .select()
      .single();
    if (!error && data) return data as Board;
    if (error && !error.message.includes('duplicate')) throw error;
  }
  throw new Error('보드 코드를 만들지 못했어요. 다시 시도해 주세요.');
}

export async function getBoardByCode(code: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from('boards')
    .select()
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return (data as Board) ?? null;
}

export async function listCards(boardId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select()
    .eq('board_id', boardId)
    .order('z_index', { ascending: true });
  if (error) throw error;
  return (data as Card[]) ?? [];
}

export async function insertCard(input: NewCard): Promise<Card> {
  const { data, error } = await supabase.from('cards').insert(input).select().single();
  if (error) throw error;
  return data as Card;
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<void> {
  const { error } = await supabase.from('cards').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}

export async function updateBoardTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('boards').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function uploadCardImage(boardId: string, file: File): Promise<string> {
  const blob = await downscaleImage(file);
  const ext = file.type === 'image/gif' ? 'gif' : 'jpg';
  const path = `${boardId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('card-images').getPublicUrl(path);
  return data.publicUrl;
}

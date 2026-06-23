import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, CardChange } from '../lib/types';
import { applyCardChange } from '../lib/cards';
import { supabase } from '../lib/supabaseClient';
import { useAnonId } from './useAnonId';
import {
  listCards, insertCard, updateCard, deleteCard, uploadCardImage,
} from '../lib/api';
import { validateImageFile } from '../lib/image';

export function useRealtimeCards(boardId: string) {
  const myId = useAnonId();
  const [cards, setCards] = useState<Card[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxZ = useRef(0);

  const reduce = useCallback((change: CardChange) => {
    setCards((cur) => applyCardChange(cur, change));
  }, []);

  // 초기 로드 + 구독
  useEffect(() => {
    let alive = true;
    async function load() {
      const initial = await listCards(boardId);
      if (!alive) return;
      maxZ.current = initial.reduce((m, c) => Math.max(m, c.z_index), 0);
      setCards(initial);
    }
    load().catch(() => setError('카드를 불러오지 못했어요.'));

    const channel = supabase
      .channel(`cards:${boardId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cards', filter: `board_id=eq.${boardId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') reduce({ eventType: 'DELETE', id: (payload.old as any).id });
          else reduce({ eventType: payload.eventType as 'INSERT' | 'UPDATE', card: payload.new as Card });
        })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        // 재연결 시 전체 재동기화
        if (status === 'SUBSCRIBED') load().catch(() => {});
      });

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [boardId, reduce]);

  const nextZ = () => (maxZ.current += 1);

  const addText = useCallback(async (x: number, y: number) => {
    try {
      const card = await insertCard({
        board_id: boardId, type: 'text', content: '', image_url: null,
        x, y, width: 160, height: 160, color: '#fff3a0', owner_id: myId, z_index: nextZ(),
      });
      reduce({ eventType: 'INSERT', card }); // 낙관적(에코도 id로 정합)
    } catch { setError('메모를 추가하지 못했어요.'); }
  }, [boardId, myId, reduce]);

  const addImage = useCallback(async (file: File, x: number, y: number) => {
    const v = validateImageFile(file);
    if (!v.ok) { setError(v.reason); return; }
    try {
      const url = await uploadCardImage(boardId, file);
      const card = await insertCard({
        board_id: boardId, type: 'image', content: null, image_url: url,
        x, y, width: 220, height: 160, color: '#ffffff', owner_id: myId, z_index: nextZ(),
      });
      reduce({ eventType: 'INSERT', card });
    } catch { setError('사진 업로드에 실패했어요.'); }
  }, [boardId, myId, reduce]);

  // 이동: 로컬 즉시 반영 + 드롭 시 1회 DB 기록
  const move = useCallback((id: string, x: number, y: number) => {
    const existing = cards.find((c) => c.id === id);
    if (existing) reduce({ eventType: 'UPDATE', card: { ...existing, x, y } });
    updateCard(id, { x, y }).catch(() => setError('이동을 저장하지 못했어요.'));
  }, [cards, reduce]);

  const patch = useCallback((id: string, p: Partial<Card>) => {
    const existing = cards.find((c) => c.id === id);
    if (existing) reduce({ eventType: 'UPDATE', card: { ...existing, ...p } });
    updateCard(id, p).catch(() => setError('변경을 저장하지 못했어요.'));
  }, [cards, reduce]);

  const remove = useCallback((id: string) => {
    reduce({ eventType: 'DELETE', id });
    deleteCard(id).catch(() => setError('삭제하지 못했어요.'));
  }, [reduce]);

  const bringToFront = useCallback((id: string) => {
    patch(id, { z_index: nextZ() });
  }, [patch]);

  return { cards, connected, addText, addImage, move, patch, remove, bringToFront, error, myId };
}

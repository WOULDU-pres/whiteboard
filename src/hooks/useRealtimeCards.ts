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
  // 진행 중(아직 서버 커밋 에코 전) 낙관적 쓰기 추적 — 재연결 재동기화가 통째 덮어쓰지
  // 않도록 보존/제외 대상을 구분(defect 12).
  const pendingInserts = useRef<Map<string, Card>>(new Map());
  const pendingDeletes = useRef<Set<string>>(new Set());

  // 들어오는 카드의 z_index를 카운터에 반영(원격 INSERT/UPDATE 포함)해 다중 접속자 간
  // z_index 충돌을 줄인다(defect 10).
  const observeZ = (z: number) => { if (z > maxZ.current) maxZ.current = z; };

  const reduce = useCallback((change: CardChange) => {
    if (change.eventType !== 'DELETE') observeZ(change.card.z_index);
    setCards((cur) => applyCardChange(cur, change));
  }, []);

  // 초기 로드 + 구독
  useEffect(() => {
    let alive = true;
    async function load() {
      const initial = await listCards(boardId);
      if (!alive) return;
      maxZ.current = initial.reduce((m, c) => Math.max(m, c.z_index), 0);
      // 통째 덮어쓰기 대신 id 기준 병합: 서버에 아직 없는 in-flight 낙관적 카드는 보존,
      // 진행 중 삭제 대상은 결과에서 제외(defect 12).
      setCards(mergeServerSnapshot(initial, pendingInserts.current, pendingDeletes.current));
    }
    load().catch(() => setError('카드를 불러오지 못했어요.'));

    const channel = supabase
      .channel(`cards:${boardId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cards', filter: `board_id=eq.${boardId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id;
            pendingDeletes.current.delete(id);
            reduce({ eventType: 'DELETE', id });
          } else {
            const card = payload.new as Card;
            // 서버 에코 도착 → 해당 in-flight 추적 해제.
            pendingInserts.current.delete(card.id);
            reduce({ eventType: payload.eventType as 'INSERT' | 'UPDATE', card });
          }
        })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        // 재연결 시 전체 재동기화(병합 기반)
        if (status === 'SUBSCRIBED') load().catch(() => {});
      });

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [boardId, reduce]);

  const nextZ = () => (maxZ.current += 1);

  const addText = useCallback(async (x: number, y: number): Promise<string | undefined> => {
    try {
      const card = await insertCard({
        board_id: boardId, type: 'text', content: '', image_url: null,
        x, y, width: 160, height: 160, color: '#fff3a0', owner_id: myId, z_index: nextZ(),
      });
      pendingInserts.current.set(card.id, card);
      reduce({ eventType: 'INSERT', card }); // 낙관적(에코도 id로 정합)
      return card.id;
    } catch { setError('메모를 추가하지 못했어요.'); return undefined; }
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
      pendingInserts.current.set(card.id, card);
      reduce({ eventType: 'INSERT', card });
    } catch { setError('사진 업로드에 실패했어요.'); }
  }, [boardId, myId, reduce]);

  // 부분 patch를 최신 상태(함수형 업데이트) 위에 적용하고, 직전 카드를 롤백용으로 캡처해
  // 반환한다. stale 스냅샷(defect 4)·롤백 부재(defect 3)를 함께 해결.
  const applyOptimistic = useCallback((id: string, p: Partial<Card>): Card | undefined => {
    let prev: Card | undefined;
    setCards((cur) => {
      const existing = cur.find((c) => c.id === id);
      if (!existing) return cur;
      prev = existing;
      const next = { ...existing, ...p };
      observeZ(next.z_index);
      return applyCardChange(cur, { eventType: 'UPDATE', card: next });
    });
    return prev;
  }, []);

  const rollback = useCallback((prev: Card | undefined) => {
    if (prev) setCards((cur) => applyCardChange(cur, { eventType: 'UPDATE', card: prev }));
  }, []);

  // 이동: 로컬 즉시 반영 + 드롭 시 1회 DB 기록. 실패 시 낙관적 업데이트 롤백 + 토스트(spec §9).
  const move = useCallback((id: string, x: number, y: number) => {
    const prev = applyOptimistic(id, { x, y });
    updateCard(id, { x, y }).catch(() => {
      setError('이동을 저장하지 못했어요.');
      rollback(prev);
    });
  }, [applyOptimistic, rollback]);

  const patch = useCallback((id: string, p: Partial<Card>) => {
    const prev = applyOptimistic(id, p);
    updateCard(id, p).catch(() => {
      setError('변경을 저장하지 못했어요.');
      rollback(prev);
    });
  }, [applyOptimistic, rollback]);

  const remove = useCallback((id: string) => {
    let prev: Card | undefined;
    setCards((cur) => {
      prev = cur.find((c) => c.id === id);
      return applyCardChange(cur, { eventType: 'DELETE', id });
    });
    pendingDeletes.current.add(id);
    deleteCard(id).catch(() => {
      setError('삭제하지 못했어요.');
      pendingDeletes.current.delete(id);
      if (prev) setCards((cur) => applyCardChange(cur, { eventType: 'INSERT', card: prev! }));
    });
  }, []);

  const bringToFront = useCallback((id: string) => {
    patch(id, { z_index: nextZ() });
  }, [patch]);

  return { cards, connected, addText, addImage, move, patch, remove, bringToFront, error, myId };
}

// 서버 스냅샷과 진행 중 낙관적 쓰기를 id 기준으로 병합(defect 12).
// - 진행 중 삭제 대상은 결과에서 제외(재동기화가 방금 지운 카드를 부활시키지 않게).
// - 서버에 아직 없는 in-flight insert는 보존(미커밋 내 추가가 사라지지 않게).
export function mergeServerSnapshot(
  server: Card[],
  pendingInserts: Map<string, Card>,
  pendingDeletes: Set<string>,
): Card[] {
  const serverIds = new Set(server.map((c) => c.id));
  const merged = server.filter((c) => !pendingDeletes.has(c.id));
  for (const [id, card] of pendingInserts) {
    if (!serverIds.has(id) && !pendingDeletes.has(id)) merged.push(card);
  }
  return merged;
}

import { useRef, useState } from 'react';
import type { Card } from '../lib/types';
import { canEdit } from '../lib/ownership';
import { PALETTE } from '../lib/cards';

interface Props {
  card: Card;
  myId: string;
  onChange: (patch: Partial<Card>) => void;
  onDelete: () => void;
  onDragEnd: (x: number, y: number) => void;
  onFocusCard: () => void;
}

export default function CardView({ card, myId, onChange, onDelete, onDragEnd, onFocusCard }: Props) {
  const mine = canEdit(card, myId);
  const [editing, setEditing] = useState(false);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const resize = useRef<{ startX: number; startW: number } | null>(null);
  const [pos, setPos] = useState({ x: card.x, y: card.y });
  const [w, setW] = useState(card.width);

  // 부모(card)가 좌표·크기의 권위. 드래그/리사이즈 중이 아니면 외부 변경을 반영.
  if (!drag.current && (pos.x !== card.x || pos.y !== card.y)) setPos({ x: card.x, y: card.y });
  if (!resize.current && w !== card.width) setW(card.width);

  function onPointerDown(e: React.PointerEvent) {
    if (editing) return;
    onFocusCard();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX, dy: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const scale = currentScale(e.currentTarget as HTMLElement);
    const nx = pos.x + (e.clientX - drag.current.dx) / scale;
    const ny = pos.y + (e.clientY - drag.current.dy) / scale;
    drag.current = { dx: e.clientX, dy: e.clientY, moved: true };
    setPos({ x: nx, y: ny });
  }
  function onPointerUp() {
    if (drag.current?.moved) onDragEnd(pos.x, pos.y);
    drag.current = null;
  }

  // 사진 카드 크기 조절(소유자) — 드래그 중 로컬, 드롭 시 1회 저장
  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { startX: e.clientX, startW: w };
  }
  function onResizeMove(e: React.PointerEvent) {
    if (!resize.current) return;
    const scale = currentScale(e.currentTarget as HTMLElement);
    const next = resize.current.startW + (e.clientX - resize.current.startX) / scale;
    setW(Math.round(Math.max(80, Math.min(600, next))));
  }
  function onResizeUp() {
    if (resize.current) onChange({ width: w });
    resize.current = null;
  }

  return (
    <div
      className="absolute select-none rounded shadow-md"
      style={{ left: pos.x, top: pos.y, width: w, zIndex: card.z_index, background: card.type === 'text' ? card.color : '#fff' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {card.type === 'image' ? (
        <img src={card.image_url ?? ''} alt="" className="w-full rounded" draggable={false} />
      ) : editing ? (
        <textarea
          autoFocus
          className="w-full resize-none bg-transparent p-3 outline-none"
          rows={4}
          defaultValue={card.content ?? ''}
          onBlur={(e) => { setEditing(false); onChange({ content: e.target.value }); }}
        />
      ) : (
        <div className="whitespace-pre-wrap p-3 text-sm" onDoubleClick={() => mine && setEditing(true)}>
          {card.content || (mine ? '두 번 눌러 입력' : '')}
        </div>
      )}

      {mine && (
        <div className="absolute -top-9 left-0 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 shadow">
          {card.type === 'text' &&
            PALETTE.map((c) => (
              <button
                key={c}
                aria-label={`색상 ${c}`}
                className="h-4 w-4 rounded-full border"
                style={{ background: c }}
                onClick={(e) => { e.stopPropagation(); onChange({ color: c }); }}
              />
            ))}
          <button className="text-xs text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            삭제
          </button>
        </div>
      )}

      {mine && card.type === 'image' && (
        <div
          aria-label="크기 조절"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-tl bg-blue-500/80"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      )}
    </div>
  );
}

// react-zoom-pan-pinch 내부 transform의 현재 scale을 DOM에서 읽음
function currentScale(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  while (node) {
    const t = getComputedStyle(node).transform;
    if (t && t !== 'none') {
      const m = new DOMMatrixReadOnly(t);
      if (m.a) return m.a;
    }
    node = node.parentElement;
  }
  return 1;
}

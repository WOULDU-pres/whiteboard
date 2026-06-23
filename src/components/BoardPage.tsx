import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBoard } from '../hooks/useBoard';
import { useRealtimeCards } from '../hooks/useRealtimeCards';
import Canvas from './Canvas';
import CardView from './Card';
import Toolbar, { ToolMode } from './Toolbar';
import TopBar from './TopBar';
import Toast from './Toast';

export default function BoardPage() {
  const { code = '' } = useParams();
  const { board, status } = useBoard(code);

  if (status === 'loading')
    return <div className="flex min-h-full items-center justify-center text-slate-400">불러오는 중…</div>;
  if (status === 'notfound' || !board)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3">
        <p className="text-slate-600">보드를 찾을 수 없어요.</p>
        <Link to="/" className="rounded-lg bg-blue-600 px-4 py-2 text-white">홈으로</Link>
      </div>
    );

  return <BoardInner boardId={board.id} code={board.code} title={board.title} />;
}

function BoardInner({ boardId, code, title }: { boardId: string; code: string; title: string }) {
  const [mode, setMode] = useState<ToolMode>('pan');
  const rc = useRealtimeCards(boardId);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (rc.error) setToast(rc.error); }, [rc.error]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <TopBar boardId={boardId} code={code} title={title} connected={rc.connected} />
      <Canvas
        addMode={mode === 'note'}
        onAddAt={(x, y) => { rc.addText(x, y); setMode('pan'); }}
      >
        {rc.cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            myId={rc.myId}
            onChange={(p) => rc.patch(c.id, p)}
            onDelete={() => rc.remove(c.id)}
            onDragEnd={(x, y) => rc.move(c.id, x, y)}
            onFocusCard={() => rc.bringToFront(c.id)}
          />
        ))}
      </Canvas>
      <Toolbar mode={mode} onMode={setMode} onPickImage={(file) => rc.addImage(file, 200 + Math.round(Math.random() * 200), 200)} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBoard } from '../lib/api';

export default function HomePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      const board = await createBoard(title.trim());
      navigate(`/b/${board.code}`);
    } catch (e) {
      setError('보드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
      setBusy(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim();
    if (code) navigate(`/b/${code}`);
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-8">
        <h1 className="text-center text-2xl font-bold text-slate-800">화이트보드</h1>

        <div className="space-y-3 rounded-2xl bg-white p-5 shadow">
          <h2 className="font-semibold text-slate-700">새 보드 만들기</h2>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="보드 제목 (선택)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white disabled:opacity-50"
            onClick={handleCreate}
            disabled={busy}
          >
            {busy ? '만드는 중…' : '새 보드 만들기'}
          </button>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-5 shadow">
          <h2 className="font-semibold text-slate-700">코드로 입장</h2>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="예: happy-tiger-42"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button className="w-full rounded-lg bg-slate-200 py-2 font-semibold text-slate-700" onClick={handleJoin}>
            입장
          </button>
        </div>

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

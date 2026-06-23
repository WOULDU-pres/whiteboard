import { useState } from 'react';
import { updateBoardTitle } from '../lib/api';

interface Props { boardId: string; code: string; title: string; connected: boolean; }

export default function TopBar({ boardId, code, title, connected }: Props) {
  const [value, setValue] = useState(title);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  function save() {
    setEditing(false);
    if (value.trim() && value !== title) updateBoardTitle(boardId, value.trim()).catch(() => {});
  }
  async function share() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex h-13 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">W</div>
      {editing ? (
        <input
          autoFocus
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      ) : (
        <button className="font-semibold text-slate-800" onClick={() => setEditing(true)}>{value}</button>
      )}
      <span className="text-xs text-slate-400">/b/{code}</span>
      <div className="flex-1" />
      <span className={`text-xs ${connected ? 'text-emerald-500' : 'text-amber-500'}`}>
        {connected ? '● 실시간' : '○ 재연결 중…'}
      </span>
      <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={share}>
        {copied ? '복사됨!' : '공유'}
      </button>
    </div>
  );
}

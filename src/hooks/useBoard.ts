import { useEffect, useState } from 'react';
import type { Board } from '../lib/types';
import { getBoardByCode } from '../lib/api';

type Status = 'loading' | 'ready' | 'notfound';

export function useBoard(code: string): { board: Board | null; status: Status } {
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getBoardByCode(code)
      .then((b) => {
        if (!alive) return;
        if (b) { setBoard(b); setStatus('ready'); }
        else setStatus('notfound');
      })
      .catch(() => alive && setStatus('notfound'));
    return () => { alive = false; };
  }, [code]);

  return { board, status };
}

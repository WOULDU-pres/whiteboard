import { createClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
// Vercel Supabase 통합은 NEXT_PUBLIC_* 로 주입된다. 로컬은 VITE_* (.env.local).
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const anonKey =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase URL/anon key 가 설정되지 않았습니다 (Vercel: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, 로컬: .env.local 의 VITE_SUPABASE_*).'
  );
}

export const supabase = createClient(url, anonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
});

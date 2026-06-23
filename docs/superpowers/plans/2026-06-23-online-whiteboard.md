# 온라인 화이트보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교육생이 로그인 없이 글·사진을 올리고 실시간으로 함께 채우는 Miro 스타일 무한 캔버스 화이트보드를 만든다.

**Architecture:** React+Vite SPA가 Supabase(Postgres·Realtime·Storage)와 직접 통신한다. 순수 로직(익명 ID·코드 생성·소유권·이미지 검증·카드 병합)은 lib에 분리해 단위 테스트하고, 데이터 접근은 `api.ts` 한 곳에 모은다. 보드 화면은 `cards`의 postgres_changes를 구독해 모든 접속자에게 변경을 전파한다.

**Tech Stack:** React 18, Vite, TypeScript(strict), Tailwind CSS, react-router-dom, @supabase/supabase-js, react-zoom-pan-pinch, Vitest + @testing-library/react(jsdom).

## Global Constraints

- Node 18+ / React 18 / TypeScript `strict: true`.
- 인증 없음. Supabase anon 키를 프론트에서 사용. 권한은 **클라이언트 측 신뢰 기반**(`owner_id` 문자열 비교) — 서버 강제 아님(spec §5).
- 환경변수는 `VITE_` 접두사: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `.env.local`은 git 추적 금지.
- 보드 코드 형식: `형용사-명사-NN` 소문자 (예: `happy-tiger-42`).
- 사진: `image/*`(jpg·png·gif·webp), 최대 5MB, 업로드 전 최대 변 1600px로 다운스케일.
- 스티키 색상 팔레트: `#fff3a0`(노랑·기본) · `#ffc7d9`(분홍) · `#bfe3ff`(파랑) · `#c8f5c8`(초록).
- 동시 편집은 last-write-wins(`updated_at`).
- 모든 카드 좌표/크기 단위는 캔버스 논리 좌표(px). 텍스트 카드 기본 160×160, 사진 카드 기본 너비 220.
- 커밋은 태스크 단위로 자주.

---

## File Structure

```
session5/
  package.json, vite.config.ts, tsconfig.json
  tailwind.config.js, postcss.config.js, index.html
  .env.example                  # 키 템플릿(추적), .env.local(미추적)
  supabase/schema.sql           # 테이블·RLS·트리거·스토리지 정책
  src/
    main.tsx                    # 엔트리 + Router
    App.tsx                     # 라우트 정의
    index.css                   # tailwind + 캔버스 배경
    lib/
      types.ts                  # Board, Card, CardChange 타입
      supabaseClient.ts         # Supabase 클라이언트
      boardCode.ts              # generateBoardCode()
      anonId.ts                 # getAnonId()
      ownership.ts              # canEdit()
      image.ts                  # validateImageFile(), downscaleImage()
      cards.ts                  # applyCardChange(), PALETTE
      api.ts                    # 데이터 접근(보드·카드·업로드)
    hooks/
      useAnonId.ts
      useBoard.ts
      useRealtimeCards.ts
    components/
      HomePage.tsx, BoardPage.tsx, TopBar.tsx,
      Canvas.tsx, Card.tsx, Toolbar.tsx, Toast.tsx
```

각 파일은 단일 책임을 갖고, 순수 로직은 React/Supabase 의존 없이 테스트 가능하게 둔다.

---

### Task 1: 프로젝트 스캐폴드 & 도구 체인

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 빌드·테스트가 도는 빈 React 앱. `npm run dev`, `npm test`.

- [ ] **Step 1: 의존성 설치**

```bash
npm init -y
npm i react react-dom react-router-dom @supabase/supabase-js react-zoom-pan-pinch
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  tailwindcss postcss autoprefixer
```

- [ ] **Step 2: 설정 파일 작성**

`package.json` 의 `"scripts"` 를 다음으로 교체:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
} as any);
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`tailwind.config.js`:

```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

`postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 3: 엔트리 파일 작성**

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>화이트보드</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; margin: 0; }
body { font-family: -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif; }
```

`src/setupTests.ts`:

```ts
import '@testing-library/jest-dom';
```

`src/App.tsx`:

```tsx
export default function App() {
  return <div>화이트보드</div>;
}
```

`src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: 스모크 테스트 작성**

`src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 테스트·빌드 확인**

Run: `npm test`
Expected: PASS (1 test)

Run: `npm run build`
Expected: 빌드 성공, `dist/` 생성

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "chore: Vite+React+TS+Tailwind+Vitest 스캐폴드"
```

---

### Task 2: Supabase 스키마 & 스토리지

**Files:**
- Create: `supabase/schema.sql`, `.env.example`

**Interfaces:**
- Consumes: 없음
- Produces: `boards`·`cards` 테이블, realtime 발행, `card-images` 공개 버킷. 프론트는 이 스키마를 전제로 동작.

- [ ] **Step 1: 스키마 SQL 작성**

`supabase/schema.sql`:

```sql
-- 테이블
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null default '제목 없는 보드',
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  type text not null check (type in ('text','image')),
  content text,
  image_url text,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 160,
  height double precision not null default 160,
  color text not null default '#fff3a0',
  owner_id text not null,
  z_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cards_board_id_idx on cards(board_id);

-- updated_at 자동 갱신
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists cards_set_updated_at on cards;
create trigger cards_set_updated_at before update on cards
  for each row execute function set_updated_at();

-- RLS: anon 허용(신뢰 환경, spec §5). 소유권은 클라이언트 강제.
alter table boards enable row level security;
alter table cards  enable row level security;
drop policy if exists "boards anon all" on boards;
drop policy if exists "cards anon all"  on cards;
create policy "boards anon all" on boards for all to anon using (true) with check (true);
create policy "cards anon all"  on cards  for all to anon using (true) with check (true);

-- realtime 발행
alter publication supabase_realtime add table cards;

-- 스토리지: 공개 읽기 버킷
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;
drop policy if exists "card-images anon read"   on storage.objects;
drop policy if exists "card-images anon insert" on storage.objects;
create policy "card-images anon read"   on storage.objects for select to anon using (bucket_id = 'card-images');
create policy "card-images anon insert" on storage.objects for insert to anon with check (bucket_id = 'card-images');
```

- [ ] **Step 2: 환경변수 템플릿 작성**

`.env.example`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

- [ ] **Step 3: Supabase 프로젝트에 스키마 적용 (수동)**

1. supabase.com에서 무료 프로젝트 생성
2. SQL Editor에 `supabase/schema.sql` 전체를 붙여넣고 실행
3. Settings → API에서 URL과 anon key 복사 → `.env.local` 작성 (`.env.example` 형식)

Expected: Table Editor에 `boards`·`cards` 가 보이고, Storage에 `card-images` 버킷이 보임.

- [ ] **Step 4: 커밋**

```bash
git add supabase/schema.sql .env.example
git commit -m "feat: Supabase 스키마·스토리지·RLS 정의"
```

---

### Task 3: 타입 & Supabase 클라이언트

**Files:**
- Create: `src/lib/types.ts`, `src/lib/supabaseClient.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_SUPABASE_*`
- Produces:
  - `type CardType = 'text' | 'image'`
  - `interface Card { id; board_id; type: CardType; content: string|null; image_url: string|null; x:number; y:number; width:number; height:number; color:string; owner_id:string; z_index:number; created_at:string; updated_at:string }`
  - `interface Board { id:string; code:string; title:string; created_at:string }`
  - `supabase` 클라이언트 인스턴스(default export `supabase`)

- [ ] **Step 1: 타입 작성**

`src/lib/types.ts`:

```ts
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
```

- [ ] **Step 2: 클라이언트 작성**

`src/lib/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다 (.env.local 확인).');
}

export const supabase = createClient(url, anonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
});
```

- [ ] **Step 3: 타입체크 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/lib/types.ts src/lib/supabaseClient.ts
git commit -m "feat: 도메인 타입과 Supabase 클라이언트"
```

---

### Task 4: 보드 코드 생성 (TDD)

**Files:**
- Create: `src/lib/boardCode.ts`
- Test: `src/lib/boardCode.test.ts`

**Interfaces:**
- Produces: `generateBoardCode(rand?: () => number): string` — `형용사-명사-NN` 형식, `rand`는 [0,1) 난수(테스트 주입용, 기본 `Math.random`).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/boardCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateBoardCode } from './boardCode';

describe('generateBoardCode', () => {
  it('형용사-명사-NN 형식을 만든다', () => {
    const code = generateBoardCode(() => 0);
    expect(code).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  it('rand=0이면 각 목록의 첫 항목과 숫자 00을 쓴다', () => {
    expect(generateBoardCode(() => 0)).toBe('happy-tiger-00');
  });

  it('서로 다른 난수면 다른 코드가 나올 수 있다', () => {
    const a = generateBoardCode(() => 0);
    const b = generateBoardCode(() => 0.999);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/boardCode.test.ts`
Expected: FAIL ("generateBoardCode is not a function" 등)

- [ ] **Step 3: 구현**

`src/lib/boardCode.ts`:

```ts
const ADJECTIVES = ['happy', 'brave', 'sunny', 'calm', 'lucky', 'swift', 'bright', 'kind'];
const NOUNS = ['tiger', 'panda', 'otter', 'koala', 'whale', 'eagle', 'fox', 'bear'];

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

export function generateBoardCode(rand: () => number = Math.random): string {
  const adj = pick(ADJECTIVES, rand);
  const noun = pick(NOUNS, rand);
  const nn = String(Math.floor(rand() * 100)).padStart(2, '0');
  return `${adj}-${noun}-${nn}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/boardCode.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/boardCode.ts src/lib/boardCode.test.ts
git commit -m "feat: 보드 코드 생성기 (TDD)"
```

---

### Task 5: 익명 ID (TDD) + 훅

**Files:**
- Create: `src/lib/anonId.ts`, `src/hooks/useAnonId.ts`
- Test: `src/lib/anonId.test.ts`

**Interfaces:**
- Produces:
  - `getAnonId(storage?: Pick<Storage,'getItem'|'setItem'>): string` — 키 `whiteboard_owner_id`. 없으면 `crypto.randomUUID()` 생성·저장 후 반환, 있으면 그대로.
  - `useAnonId(): string` — 마운트 시 한 번 `getAnonId()`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/anonId.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getAnonId } from './anonId';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('getAnonId', () => {
  it('처음 호출하면 새 ID를 만들어 저장한다', () => {
    const s = memStorage();
    const id = getAnonId(s);
    expect(id).toBeTruthy();
    expect(s.getItem('whiteboard_owner_id')).toBe(id);
  });

  it('두 번째 호출은 같은 ID를 반환한다', () => {
    const s = memStorage();
    const a = getAnonId(s);
    const b = getAnonId(s);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/anonId.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/lib/anonId.ts`:

```ts
const KEY = 'whiteboard_owner_id';

type MiniStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function getAnonId(storage: MiniStorage = window.localStorage): string {
  const existing = storage.getItem(KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(KEY, id);
  return id;
}
```

`src/hooks/useAnonId.ts`:

```ts
import { useState } from 'react';
import { getAnonId } from '../lib/anonId';

export function useAnonId(): string {
  const [id] = useState(() => getAnonId());
  return id;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/anonId.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/anonId.ts src/lib/anonId.test.ts src/hooks/useAnonId.ts
git commit -m "feat: 익명 브라우저 ID (TDD) + useAnonId 훅"
```

---

### Task 6: 소유권 판정 (TDD)

**Files:**
- Create: `src/lib/ownership.ts`
- Test: `src/lib/ownership.test.ts`

**Interfaces:**
- Produces: `canEdit(card: Pick<Card,'owner_id'>, myId: string): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ownership.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canEdit } from './ownership';

describe('canEdit', () => {
  it('내 카드면 true', () => {
    expect(canEdit({ owner_id: 'me' }, 'me')).toBe(true);
  });
  it('남의 카드면 false', () => {
    expect(canEdit({ owner_id: 'other' }, 'me')).toBe(false);
  });
  it('빈 myId는 항상 false', () => {
    expect(canEdit({ owner_id: '' }, '')).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/ownership.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/lib/ownership.ts`:

```ts
import type { Card } from './types';

export function canEdit(card: Pick<Card, 'owner_id'>, myId: string): boolean {
  return myId !== '' && card.owner_id === myId;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/ownership.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ownership.ts src/lib/ownership.test.ts
git commit -m "feat: 카드 소유권 판정 (TDD)"
```

---

### Task 7: 이미지 검증 (TDD) + 다운스케일

**Files:**
- Create: `src/lib/image.ts`
- Test: `src/lib/image.test.ts`

**Interfaces:**
- Produces:
  - `MAX_IMAGE_BYTES = 5 * 1024 * 1024`, `ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp']`
  - `validateImageFile(file: {type:string; size:number}): { ok: true } | { ok: false; reason: string }`
  - `downscaleImage(file: File, maxEdge?: number): Promise<Blob>` (브라우저 전용 — canvas)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/image.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateImageFile, MAX_IMAGE_BYTES } from './image';

describe('validateImageFile', () => {
  it('허용 형식·정상 용량이면 ok', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toEqual({ ok: true });
  });
  it('허용되지 않은 형식은 거부', () => {
    const r = validateImageFile({ type: 'application/pdf', size: 1000 });
    expect(r.ok).toBe(false);
  });
  it('용량 초과는 거부', () => {
    const r = validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/image.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/lib/image.ts`:

```ts
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function validateImageFile(
  file: { type: string; size: number }
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, reason: 'jpg·png·gif·webp 이미지만 올릴 수 있어요.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: '사진은 5MB 이하만 올릴 수 있어요.' };
  }
  return { ok: true };
}

// 브라우저 전용: 긴 변을 maxEdge로 줄여 JPEG Blob 반환. gif는 원본 유지.
export async function downscaleImage(file: File, maxEdge = 1600): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85)
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/image.test.ts`
Expected: PASS (3 tests). `downscaleImage`는 브라우저 의존이라 수동 검증(Task 14)에서 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/image.ts src/lib/image.test.ts
git commit -m "feat: 이미지 검증(TDD)·다운스케일"
```

---

### Task 8: 카드 병합 리듀서 (TDD) + 팔레트

**Files:**
- Create: `src/lib/cards.ts`
- Test: `src/lib/cards.test.ts`

**Interfaces:**
- Consumes: `Card`, `CardChange` (Task 3)
- Produces:
  - `PALETTE = ['#fff3a0','#ffc7d9','#bfe3ff','#c8f5c8']`
  - `applyCardChange(cards: Card[], change: CardChange): Card[]` — INSERT/UPDATE는 id 기준 upsert, DELETE는 제거. 입력 배열 불변.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/cards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyCardChange } from './cards';
import type { Card } from './types';

const base: Card = {
  id: 'c1', board_id: 'b1', type: 'text', content: 'hi', image_url: null,
  x: 0, y: 0, width: 160, height: 160, color: '#fff3a0', owner_id: 'me',
  z_index: 0, created_at: 't', updated_at: 't',
};

describe('applyCardChange', () => {
  it('INSERT는 새 카드를 추가한다', () => {
    const out = applyCardChange([], { eventType: 'INSERT', card: base });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c1');
  });
  it('같은 id INSERT/UPDATE는 중복 없이 교체한다', () => {
    const out1 = applyCardChange([base], { eventType: 'INSERT', card: base });
    expect(out1).toHaveLength(1);
    const out2 = applyCardChange([base], { eventType: 'UPDATE', card: { ...base, content: 'bye' } });
    expect(out2).toHaveLength(1);
    expect(out2[0].content).toBe('bye');
  });
  it('DELETE는 해당 id를 제거한다', () => {
    const out = applyCardChange([base], { eventType: 'DELETE', id: 'c1' });
    expect(out).toHaveLength(0);
  });
  it('원본 배열을 변형하지 않는다', () => {
    const arr = [base];
    applyCardChange(arr, { eventType: 'DELETE', id: 'c1' });
    expect(arr).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/cards.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/lib/cards.ts`:

```ts
import type { Card, CardChange } from './types';

export const PALETTE = ['#fff3a0', '#ffc7d9', '#bfe3ff', '#c8f5c8'];

export function applyCardChange(cards: Card[], change: CardChange): Card[] {
  if (change.eventType === 'DELETE') {
    return cards.filter((c) => c.id !== change.id);
  }
  const without = cards.filter((c) => c.id !== change.card.id);
  return [...without, change.card];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/cards.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/cards.ts src/lib/cards.test.ts
git commit -m "feat: 카드 병합 리듀서(TDD)·색상 팔레트"
```

---

### Task 9: 데이터 접근 계층 (api.ts)

**Files:**
- Create: `src/lib/api.ts`

**Interfaces:**
- Consumes: `supabase`(Task 3), `Board`/`Card`(Task 3), `generateBoardCode`(Task 4), `downscaleImage`(Task 7)
- Produces:
  - `createBoard(title: string): Promise<Board>`
  - `getBoardByCode(code: string): Promise<Board | null>`
  - `listCards(boardId: string): Promise<Card[]>`
  - `insertCard(input: NewCard): Promise<Card>` where `NewCard = Omit<Card,'id'|'created_at'|'updated_at'>`
  - `updateCard(id: string, patch: Partial<Card>): Promise<void>`
  - `deleteCard(id: string): Promise<void>`
  - `updateBoardTitle(id: string, title: string): Promise<void>`
  - `uploadCardImage(boardId: string, file: File): Promise<string>` (공개 URL 반환)

- [ ] **Step 1: 구현 작성**

`src/lib/api.ts`:

```ts
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
```

- [ ] **Step 2: 타입체크 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/lib/api.ts
git commit -m "feat: Supabase 데이터 접근 계층"
```

---

### Task 10: 라우팅 & 홈 화면

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`
- Create: `src/components/HomePage.tsx`

**Interfaces:**
- Consumes: `createBoard`(Task 9)
- Produces: 라우트 `/`(HomePage), `/b/:code`(BoardPage). HomePage에서 보드 생성/입장.

- [ ] **Step 1: 라우터 연결**

`src/main.tsx` 의 `<App />` 를 BrowserRouter로 감싼다:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

`src/App.tsx`:

```tsx
import { Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import BoardPage from './components/BoardPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/b/:code" element={<BoardPage />} />
    </Routes>
  );
}
```

- [ ] **Step 2: HomePage 작성**

`src/components/HomePage.tsx`:

```tsx
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
```

- [ ] **Step 3: 수동 검증**

`.env.local`을 채운 뒤 Run: `npm run dev`
Expected: `/` 에서 제목 입력 후 "새 보드 만들기" → `/b/<code>`로 이동(BoardPage는 Task 11에서 채움). Supabase Table Editor의 `boards`에 새 행이 보임.

- [ ] **Step 4: 커밋**

```bash
git add src/App.tsx src/main.tsx src/components/HomePage.tsx
git commit -m "feat: 라우팅 + 홈(보드 생성/입장)"
```

---

### Task 11: 보드 로드 훅 & BoardPage 골격

**Files:**
- Create: `src/hooks/useBoard.ts`, `src/components/BoardPage.tsx`

**Interfaces:**
- Consumes: `getBoardByCode`(Task 9), `useParams`
- Produces:
  - `useBoard(code: string): { board: Board | null; status: 'loading'|'ready'|'notfound' }`
  - `BoardPage` — 로딩/없음 처리 후 보드 제목 표시(캔버스는 Task 12+).

- [ ] **Step 1: useBoard 작성**

`src/hooks/useBoard.ts`:

```ts
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
```

- [ ] **Step 2: BoardPage 골격 작성**

`src/components/BoardPage.tsx`:

```tsx
import { Link, useParams } from 'react-router-dom';
import { useBoard } from '../hooks/useBoard';

export default function BoardPage() {
  const { code = '' } = useParams();
  const { board, status } = useBoard(code);

  if (status === 'loading') {
    return <div className="flex min-h-full items-center justify-center text-slate-400">불러오는 중…</div>;
  }
  if (status === 'notfound' || !board) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3">
        <p className="text-slate-600">보드를 찾을 수 없어요.</p>
        <Link to="/" className="rounded-lg bg-blue-600 px-4 py-2 text-white">홈으로</Link>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute left-4 top-3 z-10 font-semibold text-slate-800">{board.title}</div>
      {/* 캔버스·툴바는 다음 태스크에서 */}
    </div>
  );
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
Expected: 유효한 코드 → 보드 제목 표시. 임의의 잘못된 코드(`/b/none`) → "보드를 찾을 수 없어요" + 홈 링크.

- [ ] **Step 4: 커밋**

```bash
git add src/hooks/useBoard.ts src/components/BoardPage.tsx
git commit -m "feat: 보드 로드 훅 + BoardPage 골격(로딩/not-found)"
```

---

### Task 12: 캔버스 (pan/zoom + 점 격자)

**Files:**
- Create: `src/components/Canvas.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `react-zoom-pan-pinch`
- Produces: `Canvas({ children, onAddAt })` — pan/zoom 변환 래퍼. `onAddAt(x:number,y:number)`은 빈 공간 클릭 시 캔버스 논리 좌표를 콜백(메모 추가용, Task 14에서 사용). 변환 컨텍스트는 `react-zoom-pan-pinch`의 `TransformWrapper`/`TransformComponent` 사용.

- [ ] **Step 1: 점 격자 배경 클래스 추가**

`src/index.css` 끝에 추가:

```css
.dotgrid {
  background-color: #f5f6f8;
  background-image: radial-gradient(rgba(120,120,140,0.30) 1.4px, transparent 1.4px);
  background-size: 22px 22px;
}
```

- [ ] **Step 2: Canvas 작성**

`src/components/Canvas.tsx`:

```tsx
import { ReactNode, useRef } from 'react';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

interface Props {
  children: ReactNode;
  /** 빈 공간 클릭 시 캔버스 논리 좌표를 전달 */
  onAddAt?: (x: number, y: number) => void;
  /** 메모 추가 모드일 때만 클릭으로 좌표를 잡음 */
  addMode?: boolean;
}

const WORLD = 5000; // 논리 좌표 평면 크기(px)

export default function Canvas({ children, onAddAt, addMode }: Props) {
  const ref = useRef<ReactZoomPanPinchRef | null>(null);

  function handleClick(e: React.MouseEvent) {
    if (!addMode || !onAddAt) return;
    const state = ref.current?.instance.transformState;
    if (!state) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // 화면 좌표 → 논리 좌표 역변환
    const x = (e.clientX - rect.left - state.positionX) / state.scale;
    const y = (e.clientY - rect.top - state.positionY) / state.scale;
    onAddAt(x, y);
  }

  return (
    <TransformWrapper
      ref={ref}
      minScale={0.25}
      maxScale={3}
      initialScale={1}
      limitToBounds={false}
      panning={{ disabled: addMode, velocityDisabled: true }}
      doubleClick={{ disabled: true }}
      wheel={{ step: 0.08 }}
    >
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%' }}
        contentStyle={{ width: WORLD, height: WORLD }}
      >
        <div
          className="dotgrid relative"
          style={{ width: WORLD, height: WORLD, cursor: addMode ? 'crosshair' : 'grab' }}
          onClick={handleClick}
        >
          {children}
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}
```

- [ ] **Step 3: BoardPage에 임시 배치**

`src/components/BoardPage.tsx`의 반환 JSX에서 제목 아래에 캔버스를 끼워 동작을 확인(임시):

```tsx
import Canvas from './Canvas';
// ... board ready 분기의 반환부:
return (
  <div className="relative h-full w-full overflow-hidden">
    <div className="absolute left-4 top-3 z-10 font-semibold text-slate-800">{board.title}</div>
    <Canvas>
      <div className="absolute left-[200px] top-[200px] rounded bg-yellow-200 p-3">샘플 카드</div>
    </Canvas>
  </div>
);
```

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`
Expected: 보드에서 빈 공간 드래그로 이동, 스크롤/핀치로 확대·축소. 점 격자 배경. "샘플 카드"가 함께 이동·확대됨.

- [ ] **Step 5: 커밋**

```bash
git add src/components/Canvas.tsx src/components/BoardPage.tsx src/index.css
git commit -m "feat: pan/zoom 캔버스 + 점 격자 배경"
```

---

### Task 13: Card 컴포넌트 (텍스트/사진 + 소유자 컨트롤)

**Files:**
- Create: `src/components/Card.tsx`
- Test: `src/components/Card.test.tsx`

**Interfaces:**
- Consumes: `Card`(타입), `canEdit`(Task 6), `PALETTE`(Task 8)
- Produces: `CardView({ card, myId, onChange, onDelete, onDragEnd, onFocusCard })`
  - `onChange(patch: Partial<Card>)` — 내용/색상/크기 변경
  - `onDelete()` — 삭제
  - `onDragEnd(x:number, y:number)` — 드롭 위치
  - 소유자(`canEdit`)에게만 편집/삭제/색상 컨트롤 노출, 사진 카드엔 우하단 크기 조절 핸들. 드래그는 누구나.

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

`src/components/Card.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CardView from './Card';
import type { Card } from '../lib/types';

const card: Card = {
  id: 'c1', board_id: 'b1', type: 'text', content: '안녕', image_url: null,
  x: 10, y: 10, width: 160, height: 160, color: '#fff3a0', owner_id: 'me',
  z_index: 0, created_at: 't', updated_at: 't',
};
const noop = () => {};

describe('CardView', () => {
  it('텍스트 내용을 보여준다', () => {
    render(<CardView card={card} myId="me" onChange={noop} onDelete={noop} onDragEnd={noop} onFocusCard={noop} />);
    expect(screen.getByText('안녕')).toBeInTheDocument();
  });
  it('소유자에게는 삭제 버튼이 보인다', () => {
    render(<CardView card={card} myId="me" onChange={noop} onDelete={noop} onDragEnd={noop} onFocusCard={noop} />);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });
  it('소유자가 아니면 삭제 버튼이 없다', () => {
    render(<CardView card={card} myId="other" onChange={noop} onDelete={noop} onDragEnd={noop} onFocusCard={noop} />);
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/Card.test.tsx`
Expected: FAIL (Card.tsx 없음)

- [ ] **Step 3: 구현**

`src/components/Card.tsx`:

```tsx
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/Card.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/Card.tsx src/components/Card.test.tsx
git commit -m "feat: Card 컴포넌트(텍스트/사진·소유자 컨트롤·드래그) + 테스트"
```

---

### Task 14: 실시간 카드 훅 + 보드 통합 (메모/사진 추가·이동·삭제)

**Files:**
- Create: `src/hooks/useRealtimeCards.ts`
- Modify: `src/components/BoardPage.tsx`, `src/components/Toolbar.tsx`(생성)

**Interfaces:**
- Consumes: `listCards`/`insertCard`/`updateCard`/`deleteCard`/`uploadCardImage`(Task 9), `applyCardChange`(Task 8), `supabase`(Task 3), `useAnonId`(Task 5), `Canvas`(Task 12), `CardView`(Task 13)
- Produces:
  - `useRealtimeCards(boardId: string): { cards: Card[]; connected: boolean; addText(x,y): Promise<void>; addImage(file, x, y): Promise<void>; move(id,x,y): void; patch(id, patch): void; remove(id): void; bringToFront(id): void; error: string | null }`
  - `Toolbar({ mode, onMode, onPickImage })` — 아래 중앙 떠 있는 툴바.

- [ ] **Step 1: useRealtimeCards 작성**

`src/hooks/useRealtimeCards.ts`:

```ts
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
```

> 참고: 드래그 중에는 `CardView`가 로컬 좌표만 갱신하고, `onDragEnd`(드롭) 때 `move`가 한 번 호출되어 DB에 기록된다 → 쓰기 폭주가 없다(spec §7는 "드롭 시 또는 throttle"을 허용). 다른 접속자는 드롭 시점에 최종 위치를 받는다. 드래그 중 실시간 글라이딩은 선택적 개선 사항.

- [ ] **Step 2: Toolbar 작성**

`src/components/Toolbar.tsx`:

```tsx
import { useRef } from 'react';

export type ToolMode = 'pan' | 'note';

interface Props {
  mode: ToolMode;
  onMode: (m: ToolMode) => void;
  onPickImage: (file: File) => void;
}

export default function Toolbar({ mode, onMode, onPickImage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-2xl bg-white px-3 py-2 shadow-lg">
      <button
        className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'pan' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
        onClick={() => onMode('pan')}
      >🖐️ 이동</button>
      <button
        className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'note' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
        onClick={() => onMode('note')}
      >📝 메모</button>
      <button
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600"
        onClick={() => fileRef.current?.click()}
      >🖼️ 사진</button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: BoardPage 통합**

`src/components/BoardPage.tsx` 의 ready 분기를 다음으로 교체:

```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBoard } from '../hooks/useBoard';
import { useRealtimeCards } from '../hooks/useRealtimeCards';
import Canvas from './Canvas';
import CardView from './Card';
import Toolbar, { ToolMode } from './Toolbar';

export default function BoardPage() {
  const { code = '' } = useParams();
  const { board, status } = useBoard(code);
  const [mode, setMode] = useState<ToolMode>('pan');

  if (status === 'loading')
    return <div className="flex min-h-full items-center justify-center text-slate-400">불러오는 중…</div>;
  if (status === 'notfound' || !board)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3">
        <p className="text-slate-600">보드를 찾을 수 없어요.</p>
        <Link to="/" className="rounded-lg bg-blue-600 px-4 py-2 text-white">홈으로</Link>
      </div>
    );

  return <BoardInner boardId={board.id} title={board.title} mode={mode} setMode={setMode} />;
}

function BoardInner({ boardId, title, mode, setMode }:
  { boardId: string; title: string; mode: ToolMode; setMode: (m: ToolMode) => void }) {
  const rc = useRealtimeCards(boardId);
  // 사진 추가는 화면 중앙 근처 임의 위치에 배치
  const dropImage = (file: File) => rc.addImage(file, 200 + Math.round(Math.random() * 200), 200);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute left-4 top-3 z-10 font-semibold text-slate-800">{title}</div>
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
      <Toolbar mode={mode} onMode={setMode} onPickImage={dropImage} />
    </div>
  );
}
```

- [ ] **Step 4: 수동 검증 (실시간 E2E)**

Run: `npm run dev`. 같은 보드 URL을 **브라우저 2개**(또는 시크릿 창)로 연다.
Expected:
- A창에서 `메모` → 캔버스 클릭 → 노트 생성, B창에 즉시 나타남
- A창에서 노트 드래그 → B창에서 같이 움직임
- A창에서 `사진` → 이미지 선택 → 업로드 후 양쪽에 표시. 내 사진 카드 우하단 핸들을 끌어 크기 조절 → 드롭 시 양쪽에 반영
- 내 노트만 색상/삭제 버튼이 보이고, 남의 노트는 이동만 됨
- 삭제하면 양쪽에서 사라짐

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useRealtimeCards.ts src/components/Toolbar.tsx src/components/BoardPage.tsx
git commit -m "feat: 실시간 카드 동기화 + 메모/사진 추가·이동·삭제 + 아래 중앙 툴바"
```

---

### Task 15: 상단바 (제목 수정 + 공유)

**Files:**
- Create: `src/components/TopBar.tsx`
- Modify: `src/components/BoardPage.tsx`

**Interfaces:**
- Consumes: `updateBoardTitle`(Task 9)
- Produces: `TopBar({ boardId, code, title, connected })` — 제목 인라인 수정, `공유`(현재 URL 클립보드 복사), 연결 상태 표시.

- [ ] **Step 1: TopBar 작성**

`src/components/TopBar.tsx`:

```tsx
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
```

- [ ] **Step 2: BoardInner에 연결**

`BoardInner`에서 기존 제목 `<div>`를 제거하고 상단바를 넣는다. 캔버스가 상단바에 가리지 않도록 캔버스 영역에 `top-13`(약 52px) 패딩 효과를 위해 래퍼에 `pt-13`은 두지 않고, `TopBar`는 절대배치 오버레이로 둔다(카드는 캔버스 좌표라 영향 없음):

```tsx
import TopBar from './TopBar';
import { useParams } from 'react-router-dom';
// BoardInner 시그니처에 code 추가: { boardId, code, title, mode, setMode }
// 반환 JSX 최상단 제목 div 제거 후:
<TopBar boardId={boardId} code={code} title={title} connected={rc.connected} />
```

`BoardPage`에서 `BoardInner`에 `code={board.code}` 를 넘기도록 props를 추가한다.

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
Expected: 제목 클릭 → 수정 후 Enter/blur 시 저장(새로고침해도 유지). `공유` → URL 복사, "복사됨!" 표시. 연결 상태 뱃지가 `● 실시간`으로 보임.

- [ ] **Step 4: 커밋**

```bash
git add src/components/TopBar.tsx src/components/BoardPage.tsx
git commit -m "feat: 상단바(제목 수정·공유·연결 상태)"
```

---

### Task 16: 토스트 에러 표시

**Files:**
- Create: `src/components/Toast.tsx`
- Modify: `src/components/BoardPage.tsx`

**Interfaces:**
- Consumes: `useRealtimeCards`의 `error`
- Produces: `Toast({ message, onClose })` — 화면 하단에 잠깐 뜨는 에러 토스트.

- [ ] **Step 1: Toast 작성**

`src/components/Toast.tsx`:

```tsx
import { useEffect } from 'react';

export default function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}
```

- [ ] **Step 2: BoardInner에 연결**

`BoardInner`에서 `rc.error`를 토스트로 노출하고, 닫으면 에러를 비운다. `useRealtimeCards`에 `clearError()`가 없으므로, 로컬 상태로 마지막 표시 에러를 관리:

```tsx
import { useEffect, useState } from 'react';
import Toast from './Toast';
// BoardInner 내부:
const [toast, setToast] = useState<string | null>(null);
useEffect(() => { if (rc.error) setToast(rc.error); }, [rc.error]);
// 반환 JSX 끝에:
{toast && <Toast message={toast} onClose={() => setToast(null)} />}
```

- [ ] **Step 3: 수동 검증**

검증: 개발자도구 Network를 offline으로 두고 메모를 추가하면, 잠시 후 "메모를 추가하지 못했어요." 토스트가 떴다가 3초 뒤 사라짐. (확인 후 online 복귀)

- [ ] **Step 4: 커밋**

```bash
git add src/components/Toast.tsx src/components/BoardPage.tsx
git commit -m "feat: 에러 토스트"
```

---

### Task 17: 배포 가이드 (Vercel + Supabase)

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 없음
- Produces: 로컬 실행·배포 절차 문서.

- [ ] **Step 1: README 작성**

`README.md`:

````markdown
# 온라인 화이트보드

로그인 없이 글·사진을 올리는 실시간 Miro 스타일 화이트보드.

## 로컬 실행

1. `npm install`
2. Supabase 프로젝트 생성 후 `supabase/schema.sql` 을 SQL Editor에서 실행
3. `.env.local` 작성 (`.env.example` 참고):
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. `npm run dev`

## 배포 (Vercel)

1. GitHub에 푸시 후 Vercel에서 import
2. Framework Preset: **Vite**
3. 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가
4. SPA 라우팅: 프로젝트 루트에 `vercel.json` 추가
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
   ```
5. Deploy

## 테스트

- `npm test` — 단위·컴포넌트 테스트
- 실시간 동기화는 브라우저 2개로 같은 보드를 열어 수동 확인
````

- [ ] **Step 2: vercel.json 작성**

`vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```

- [ ] **Step 3: 전체 테스트·빌드 확인**

Run: `npm test && npm run build`
Expected: 모든 테스트 PASS, 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add README.md vercel.json
git commit -m "docs: 실행·배포 가이드 + Vercel SPA rewrite"
```

---

## 검증 체크리스트 (전체 완료 후)

- [ ] 홈에서 새 보드 생성 → URL 이동
- [ ] 코드로 입장 / 잘못된 코드 → not-found
- [ ] pan/zoom 동작, 점 격자 배경
- [ ] 메모 추가·수정·색상 변경·삭제(내 것만)
- [ ] 사진 업로드(검증·다운스케일) 및 표시
- [ ] 카드 드래그 이동
- [ ] 브라우저 2개 실시간 동기화(추가·이동·삭제)
- [ ] 제목 수정·공유(URL 복사)·연결 상태 뱃지
- [ ] 에러 토스트
- [ ] `npm test` 통과, `npm run build` 성공
- [ ] Vercel 배포 후 실제 URL에서 동일 동작

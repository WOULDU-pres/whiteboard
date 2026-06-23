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

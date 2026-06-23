import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Vercel의 Supabase 통합은 NEXT_PUBLIC_* 이름으로 env를 주입한다(VITE_ 아님).
  // 클라이언트 번들에 두 접두사 모두 노출해 통합 변수를 그대로 쓴다.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
} as any);

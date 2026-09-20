import { defineConfig } from 'vitest/config';

// 纯逻辑测试（不触库、不联网）默认跑；需要 PostgreSQL 的用 *.dbtest.ts，
// 由 npm run verify:api:db 单独跑。
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});

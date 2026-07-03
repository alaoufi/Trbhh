import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Next's poison-pill packages must be neutralized under plain Node.
      'server-only': path.resolve(__dirname, 'tests/stubs/empty.ts'),
      'client-only': path.resolve(__dirname, 'tests/stubs/empty.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    env: {
      // Pure-logic tests never query the DB, but some modules construct a
      // Prisma client at import time — give it a harmless URL.
      DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/test',
    },
  },
});

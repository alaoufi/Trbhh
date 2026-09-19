import { defineConfig } from 'vitest/config';
import path from 'node:path';

const authDbTests = process.env.AUTH_DB_TESTS === '1';
const authTestUrl = process.env.AUTH_TEST_DATABASE_URL || '';
if (authDbTests) {
  const url = new URL(authTestUrl);
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['/ci', '/trbhh_auth_test'].includes(url.pathname)) {
    throw new Error('AUTH_DB_TESTS requires an explicit disposable MySQL database on loopback');
  }
}
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      // Shared preview components must use the root renderer, even when both
      // applications have separate node_modules installations locally.
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'next': path.resolve(__dirname, 'node_modules/next'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
      // Next's poison-pill packages must be neutralized under plain Node.
      'server-only': path.resolve(__dirname, 'tests/stubs/empty.ts'),
      'client-only': path.resolve(__dirname, 'tests/stubs/empty.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    // Never import database integration modules during the default unit run.
    include: authDbTests ? ['tests/integration/**/*.test.ts'] : ['tests/unit/**/*.test.ts'],
    env: {
      // Pure-logic tests never query the DB, but some modules construct a
      // Prisma client at import time — give it a harmless URL.
      DATABASE_URL: authDbTests ? authTestUrl : 'mysql://test:test@127.0.0.1:3306/test',
    },
  },
});

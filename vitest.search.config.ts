import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { isolatedSearchUrl } from './tests/helpers/search-visibility-fixture';

const enabled = process.env.SEARCH_VISIBILITY_MYSQL === '1';
const databaseUrl = enabled
  ? isolatedSearchUrl(process.env.SEARCH_TEST_DATABASE_URL).href
  : 'mysql://fixture:fixture@127.0.0.1:33309/trbhh_search_visibility_test';

export default defineConfig({
  resolve: { alias: { 'server-only': path.resolve(__dirname, 'tests/stubs/empty.ts'), '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/unit/search-card-visibility-mysql.test.ts', 'tests/unit/search-card-visibility-fixture.test.ts'],
    fileParallelism: false, maxWorkers: 1, testTimeout: 30000, hookTimeout: 60000,
    env: { DATABASE_URL: databaseUrl, SUPPLIER_ALLOW_LIVE_ORDERS: 'false' },
  },
});

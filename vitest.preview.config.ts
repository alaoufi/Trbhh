import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { 'server-only': path.resolve(__dirname, 'tests/stubs/empty.ts'), '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['tests/preview/setup.test.ts'], fileParallelism: false },
});

import { defineConfig } from 'vitest/config';
import base from '../vitest.config';

export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/browser/site-design.test.tsx'], testTimeout: 30_000 },
});

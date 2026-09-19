import {defineConfig} from 'vitest/config';
import path from 'node:path';

// Only this file opts in to the destructive disposable-database fixture.
export default defineConfig({
  resolve:{alias:{'server-only':path.resolve(__dirname,'tests/stubs/empty.ts'),'@':path.resolve(__dirname,'src')}},
  test:{environment:'node',include:['tests/integration/commerce-orders-mysql.test.ts'],fileParallelism:false,testTimeout:20000,hookTimeout:30000},
});

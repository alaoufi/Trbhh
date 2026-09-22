import {defineConfig} from 'vitest/config';
import path from 'node:path';

/** Destructive fixture access is restricted to a new database on the test port. */
export function isolatedFinanceUrl(raw:string|undefined):URL {
  let url:URL;
  try {url=new URL(raw??'');} catch {throw new Error('Refusing non-isolated finance DB');}
  if(url.protocol!=='mysql:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.port!=='33309'||url.pathname!=='/trbhh_finance_test'||url.search||url.hash||url.username!=='root'||!url.password)throw new Error('Refusing non-isolated finance DB');
  return url;
}
const enabled=process.env.FINANCE_DB_TESTS==='1';
const databaseUrl=enabled?isolatedFinanceUrl(process.env.FINANCE_TEST_DATABASE_URL).href:'mysql://fixture:fixture@127.0.0.1:33309/trbhh_finance_test';
export default defineConfig({
  resolve:{alias:{'server-only':path.resolve(__dirname,'tests/stubs/empty.ts'),'@':path.resolve(__dirname,'src')}},
  test:{environment:'node',include:['tests/integration/finance-mysql.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:30000,hookTimeout:60000,env:{DATABASE_URL:databaseUrl}},
});

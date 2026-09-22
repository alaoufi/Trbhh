import {defineConfig} from 'vitest/config';
import path from 'node:path';
export function isolatedAccessUrl(raw:string|undefined):URL{
  let url:URL;try{url=new URL(raw??'');}catch{throw new Error('Refusing non-isolated RBAC DB');}
  if(url.protocol!=='mysql:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.port!=='33309'||url.pathname!=='/trbhh_rbac_test'||url.search||url.hash||url.username!=='root'||!url.password)throw new Error('Refusing non-isolated RBAC DB');
  return url;
}
const enabled=process.env.RBAC_DB_TESTS==='1';
export default defineConfig({
  resolve:{alias:{'server-only':path.resolve(__dirname,'tests/stubs/empty.ts'),'@':path.resolve(__dirname,'src')}},
  test:{environment:'node',include:['tests/integration/access-control-mysql.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:30000,hookTimeout:60000,env:{DATABASE_URL:enabled?isolatedAccessUrl(process.env.RBAC_TEST_DATABASE_URL).href:'mysql://fixture:fixture@127.0.0.1:33309/trbhh_rbac_test'}},
});

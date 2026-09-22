import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
const require=createRequire(import.meta.url);
const {build}=require('../../scripts/release/build-access-control-bootstrap.cjs') as {build:()=>string};
describe('explicit access-control migration artifact',()=>{
  it('compiles only source needed for access migration, without web or financial adapters',()=>{
    const source=build();
    expect(source).toContain('access_user_roles');expect(source).toContain('access_audit');
    expect(source).not.toContain('supplier_connections');expect(source).not.toContain('commerce_purchasing_enabled');
    expect(source).not.toContain("require(\"next/headers\")");expect(source).not.toContain('FINANCE_CAPTURE_SECRET');
  });
  it('rejects missing consent or malformed actor before constructing a database client',async()=>{
    const construct=vi.fn();class FakeClient{constructor(){construct();throw new Error('no database access permitted in this test');}}
    const bundleModule={exports:{} as {main?:(args:string[])=>Promise<number>}};
    const load=Object.assign((id:string)=>id==='@prisma/client'?{PrismaClient:FakeClient}:require(id),{main:null});
    new Script(build()).runInNewContext({require:load,module:bundleModule,exports:bundleModule.exports,console:{error:vi.fn(),info:vi.fn()},process:{argv:[]}});
    for(const args of [[],['--actor','1'],['--apply','--actor','0'],['--apply','--actor','999999999999999999999999'],['--apply','--actor','1','extra']])expect(await bundleModule.exports.main!(args)).toBe(2);
    expect(construct).not.toHaveBeenCalled();
  });
});

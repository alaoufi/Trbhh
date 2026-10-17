import {createRequire} from 'node:module';
import {describe,it,expect,vi} from 'vitest';
const {expectedIdentityFromLogs,readExpectedIdentity,stageExpectedIdentity}=createRequire(import.meta.url)('../../scripts/diagnostics/cj-sandbox-identity.cjs');
const identity={reference:'trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde',orderId:'2610171053280661800',cjOrderCode:'SD2610171053270664700'};
describe('CJ source-record identity without manual number transcription',()=>{
 it('stages only source-log identities with nonroot-runtime read access and exclusive creation',()=>{
  const write=vi.fn(),chmod=vi.fn();const stat={isFile:()=>true,isDirectory:()=>true,isSymbolicLink:()=>false,size:300};
  const io={lstatSync:()=>stat,readdirSync:()=>['cj-url-repair-ABC','unrelated'],existsSync:()=>true,readFileSync:()=>JSON.stringify({event:'CJ_SANDBOX_IDENTIFIED',...identity}),writeFileSync:write,chmodSync:chmod};
  expect(stageExpectedIdentity('/logs','/out',io)).toEqual(identity);expect(write).toHaveBeenCalledExactlyOnceWith('/out',JSON.stringify(identity)+'\n',{mode:0o644,flag:'wx'});
  expect(()=>stageExpectedIdentity('/logs','/out',{...io,lstatSync:()=>({...stat,isSymbolicLink:()=>true})})).toThrow();
  expect(chmod).toHaveBeenCalledExactlyOnceWith('/out',0o644);
 });
 it('retains distinct exact large strings from the original event without numeric conversion',()=>{const line=JSON.stringify({event:'CJ_SANDBOX_IDENTIFIED',...identity,status:'CREATED'});expect(expectedIdentityFromLogs(['shell output\n'+line,line])).toEqual(identity);});
 it('rejects absent, malformed, numerically coerced or conflicting identities',()=>{
  for(const values of [[],['{}'],[JSON.stringify({event:'CJ_SANDBOX_IDENTIFIED',...identity,orderId:2610171053280661800})],[JSON.stringify({event:'CJ_SANDBOX_IDENTIFIED',...identity}),JSON.stringify({event:'CJ_SANDBOX_IDENTIFIED',...identity,cjOrderCode:'SD999999999'})]])expect(()=>expectedIdentityFromLogs(values)).toThrow();
 });
 it('requires a small regular nonsymlink sidecar with exactly the three expected fields',()=>{
  const stat={isFile:()=>true,isSymbolicLink:()=>false,size:200};
  const io={lstatSync:()=>stat,readFileSync:()=>JSON.stringify(identity)};
  expect(readExpectedIdentity('/expected',io)).toEqual(identity);
  for(const replacement of [{...stat,isSymbolicLink:()=>true},{...stat,isFile:()=>false},{...stat,size:5000}])expect(()=>readExpectedIdentity('/expected',{...io,lstatSync:()=>replacement})).toThrow();
  expect(()=>readExpectedIdentity('/expected',{...io,readFileSync:()=>JSON.stringify({...identity,extra:'x'})})).toThrow();
 });
});

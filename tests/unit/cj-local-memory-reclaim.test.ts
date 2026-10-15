import {createRequire} from 'node:module';
import {describe,expect,it} from 'vitest';
const {selectGroups}=createRequire(import.meta.url)('../../scripts/local-ai/reclaim-test-memory.cjs');
function fixture(){
 const run='123',network='trbhh-final-123';
 const production={Id:'prod',Name:'/trbhh-app',State:{Running:true},Config:{Env:['DATABASE_URL=mysql://private:private@production-db:3306/db']},NetworkSettings:{Networks:{production:{}}},Mounts:[{Source:'/production-media'}]};
 const clone={Id:'clone',Name:'/trbhh-final-db-123',Created:'2020-01-01T00:00:00Z',State:{Running:true},Config:{Labels:{'trbhh.final-gate':run}},NetworkSettings:{Networks:{[network]:{IPAddress:'172.31.1.2'}},Ports:{'3306/tcp':null}},HostConfig:{PortBindings:{}},Mounts:[] as {Source:string}[]};
 const net={Name:network,Internal:true,Labels:{'trbhh.final-gate':run},Containers:{clone:{}}};
 return {production,clone,net};
}
describe('verified obsolete test memory reclaim',()=>{
 it('selects an old tagged, isolated clone only',()=>{const f=fixture();expect(selectGroups([f.production,f.clone],[f.net])).toEqual([f.clone]);});
 it('requires running production identity',()=>{expect(()=>selectGroups([],[])).toThrow();});
 it.each(['label','shared-network','exposed-port','new','production-mount','production-dependency','foreign-member','external-network'])('rejects unsafe group: %s',reason=>{
  const f=fixture();
  if(reason==='label')f.clone.Config.Labels['trbhh.final-gate']='other';
  if(reason==='shared-network')Object.assign(f.clone.NetworkSettings.Networks,{production:{}});
  if(reason==='exposed-port')Object.assign(f.clone.HostConfig.PortBindings,{'3306/tcp':[{HostPort:'3306'}]});
  if(reason==='new')f.clone.Created=new Date().toISOString();
  if(reason==='production-mount')f.clone.Mounts=[{Source:'/production-media'}];
  if(reason==='production-dependency')f.production.Config.Env=['DATABASE_URL=mysql://private:private@172.31.1.2:3306/db'];
  if(reason==='foreign-member')Object.assign(f.net.Containers,{unknown:{}});
  if(reason==='external-network')f.net.Internal=false;
  expect(selectGroups([f.production,f.clone],[f.net])).toEqual([]);
 });
});

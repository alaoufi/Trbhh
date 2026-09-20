import {describe,it,expect,vi} from 'vitest';
import {encryptDetails,decryptDetails,issuePreviewToken,verifyPreviewToken,inspectOnboarding,saveOnboarding} from '@/lib/suppliers/onboarding-store';
import type {CommerceDb} from '@/lib/commerce/types';
const secret='ab'.repeat(32),values={establishment_name:'شركة',store_name:'متجر',registration_number:'1010123456',store_url:'https://salla.sa/trbhh-test',contact_name:'مفوض',phone:'+966501234567',email:'test@example.com'};
function fixture(existing=false){
 const supplier={id:1n,name:'متجر قديم',contact_name:'مفوض',phone:'+966501234567',email:'test@example.com',address:'عنوان',registration_number:'1010123456',tax_number:'',settlement_terms:'شهري',notes:'احتفظ',active:0,updated_at:new Date()};
 const writes:{sql:string;values:unknown[]}[]=[],audits:unknown[]=[];
 let rows=existing?[supplier]:[],onboarding:unknown[]=[],emailOwners:unknown[]=[],connections:unknown[]=[];
 const tx={$queryRaw:vi.fn(async(first:TemplateStringsArray|{sql:string;values:unknown[]},...args:unknown[])=>{
  const sql='sql' in first?first.sql:first.join('?');
  if(sql.includes('supplier_onboarding WHERE'))return onboarding;
  if(sql.includes('supplier_connections'))return connections;
  if(sql.includes('supplier_integration_profiles'))return [];
  if(sql.includes('api_base_url'))return [];
  if(sql.includes('LOWER(email)'))return emailOwners;
  if(sql.includes('commerce_suppliers'))return rows;
  if(sql.includes('LAST_INSERT_ID'))return [{id:1n}];
  if(sql.includes('site_settings'))return [{k:'supplier_onboarding_mutex'}];
  throw Error('unexpected '+sql+args.length);
 }),$executeRaw:vi.fn(async(s:TemplateStringsArray,...args:unknown[])=>{writes.push({sql:s.join('?'),values:args});return 1;}),admin_log:{create:vi.fn(async(v:unknown)=>{audits.push(v);})}};
 const db={$queryRaw:tx.$queryRaw,$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)} as unknown as CommerceDb;
 return {db,writes,audits,setRows:(v:typeof rows)=>{rows=v;},setOnboarding:(v:unknown[])=>{onboarding=v;},setEmail:(v:unknown[])=>{emailOwners=v;},setConnections:(v:unknown[])=>{connections=v;}};
}
describe('registration import integrity',()=>{
 it('encrypts additional personal/bank details bound to supplier',()=>{const encrypted=encryptDetails({iban:'private'},1n,secret);expect(encrypted).not.toContain('private');expect(decryptDetails(encrypted,1n,secret)).toEqual({iban:'private'});expect(()=>decryptDetails(encrypted,2n,secret)).toThrow();});
 it('binds preview to file, admin, expiry and tamper protection',()=>{const t=issuePreviewToken('fp',1n,'file',secret,0);expect(verifyPreviewToken(t,1n,'file',secret,10)).toBe('fp');expect(()=>verifyPreviewToken(t,2n,'file',secret,10)).toThrow();expect(()=>verifyPreviewToken(t,1n,'other',secret,10)).toThrow();expect(()=>verifyPreviewToken(t,1n,'file',secret,99999999)).toThrow();expect(()=>verifyPreviewToken(t+'x',1n,'file',secret,10)).toThrow();});
 it('creates one supplier using existing profiles with sync and autoorders disabled',async()=>{const f=fixture(),p=await inspectOnboarding(f.db,values,secret);const r=await saveOnboarding(f.db,{values,fingerprint:p.fingerprint,filename:'store.xlsx',adminId:3n,secret,canCreate:true,canEdit:false});expect(r.supplierId).toBe('1');expect(f.writes.filter(w=>w.sql.includes('INSERT INTO commerce_suppliers'))).toHaveLength(1);expect(f.writes.some(w=>w.sql.includes("'salla',0,0,0,'development'"))).toBe(true);expect(JSON.stringify(f.audits,(_,v)=>typeof v==='bigint'?String(v):v)).not.toContain(values.email);});
 it('same registration updates and blank optional cells preserve previous data',async()=>{const f=fixture(true),p=await inspectOnboarding(f.db,{...values,notes:''},secret);expect(p.merged.notes).toBe('احتفظ');await saveOnboarding(f.db,{values,fingerprint:p.fingerprint,filename:'store.xlsx',adminId:3n,secret,canCreate:false,canEdit:true}).catch(e=>{expect(e.message).toBe('onboarding_preview_stale');});const p2=await inspectOnboarding(f.db,values,secret);await saveOnboarding(f.db,{values,fingerprint:p2.fingerprint,filename:'store.xlsx',adminId:3n,secret,canCreate:false,canEdit:true});expect(f.writes.some(w=>w.sql.includes('INSERT INTO commerce_suppliers'))).toBe(false);expect(f.writes.find(w=>w.sql.includes('UPDATE commerce_suppliers'))?.sql).not.toContain('active=');});
 it('conflicts on store URL owned by different registration',async()=>{const f=fixture();f.setOnboarding([{supplier_id:2n,registration_number:'9999999999',store_url:values.store_url}]);await expect(inspectOnboarding(f.db,values,secret)).rejects.toThrow('onboarding_url_conflict');});
 it('warns on email without merging and respects connected supplier',async()=>{const f=fixture(true);f.setEmail([{id:2n}]);f.setConnections([{id:3n,status:'connected',version:1}]);const p=await inspectOnboarding(f.db,values,secret);expect(p.warnings).toHaveLength(1);expect(p.connected).toBe(true);expect(p.existing.id).toBe(1n);});
 it('rejects stale preview and wrong write permission',async()=>{const f=fixture();await expect(saveOnboarding(f.db,{values,fingerprint:'old',filename:'x.xlsx',adminId:3n,secret,canCreate:true,canEdit:true})).rejects.toThrow('onboarding_preview_stale');const p=await inspectOnboarding(f.db,values,secret);await expect(saveOnboarding(f.db,{values,fingerprint:p.fingerprint,filename:'x.xlsx',adminId:3n,secret,canCreate:false,canEdit:true})).rejects.toThrow('onboarding_forbidden');});
});

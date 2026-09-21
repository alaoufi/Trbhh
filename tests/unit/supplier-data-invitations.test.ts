import {describe,it,expect,vi,afterEach} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {OnboardingValues} from '@/lib/suppliers/onboarding-fields';
import {
 DATA_INVITE_LIFETIME_MS,invitationTokenHash,encryptInvitationDraft,decryptInvitationDraft,
 issueSupplierDataInvitation,resolveSupplierDataInvitation,saveSupplierDataInvitation,revokeSupplierDataInvitation,
} from '@/lib/suppliers/data-invitations';

const secret='ab'.repeat(32);
const values:OnboardingValues={establishment_name:'شركة الاختبار',store_name:'متجر الاختبار',registration_number:'1010123456',store_url:'https://salla.sa/test-store',contact_name:'محمد',phone:'+966501234567',email:'owner@example.com'};
const db=(tx:object)=>({$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb);
afterEach(()=>vi.useRealTimers());

describe('supplier data invitations',()=>{
 it('uses an opaque 256-bit token and stores only its SHA-256 digest with a seven-day expiry',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T00:00:00Z'));
  const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:7n,name:'متجر'}]).mockResolvedValueOnce([{generation:2}]),$executeRaw:vi.fn().mockResolvedValue(1)};
  const result=await issueSupplierDataInvitation(db(tx),7n,3n,secret,'https://trbhh.sa');
  expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.expiresAt.getTime()-Date.now()).toBe(DATA_INVITE_LIFETIME_MS);
  expect(result.url).toBe(`https://trbhh.sa/supplier/data/${result.token}`);
  const call=tx.$executeRaw.mock.calls[0];
  expect(call).toBeTruthy();
  expect(call.flat().join('')).not.toContain(result.token);
  expect(call.flat().some(value=>Buffer.isBuffer(value)&&value.equals(invitationTokenHash(result.token)))).toBe(true);
 });

 it('binds encrypted drafts to supplier and generation',()=>{
  const encrypted=encryptInvitationDraft(values,7n,2,secret);
  expect(encrypted).not.toContain('owner@example.com');
  expect(decryptInvitationDraft(encrypted,7n,2,secret)).toEqual(values);
  expect(()=>decryptInvitationDraft(encrypted,8n,2,secret)).toThrow('supplier_data_encryption');
  expect(()=>decryptInvitationDraft(encrypted,7n,3,secret)).toThrow('supplier_data_encryption');
 });

 it('resolves only the exact unexpired token and returns no administrative data',async()=>{
  const token='A'.repeat(43),encrypted=encryptInvitationDraft(values,7n,1,secret);
  const row={supplier_id:7n,name:'متجر',generation:1,status:'draft',encrypted_draft:encrypted,expires_at:new Date(Date.now()+10000)};
  const query={$queryRaw:vi.fn().mockResolvedValue([row])} as unknown as CommerceDb;
  await expect(resolveSupplierDataInvitation(query,token,secret)).resolves.toEqual({supplierId:'7',supplierName:'متجر',generation:1,status:'draft',values,expiresAt:row.expires_at.toISOString()});
  expect(query.$queryRaw).toHaveBeenCalledWith(expect.anything(),invitationTokenHash(token));
  row.expires_at=new Date(0);
  await expect(resolveSupplierDataInvitation(query,token,secret)).rejects.toThrow('supplier_data_invitation_invalid');
 });

 it('saves a partial draft but requires complete valid data for final submission',async()=>{
  const token='B'.repeat(43);
  const row={supplier_id:7n,generation:1,status:'open',expires_at:new Date(Date.now()+10000)};
  const tx={$queryRaw:vi.fn().mockResolvedValue([row]),$executeRaw:vi.fn().mockResolvedValue(1)};
  await expect(saveSupplierDataInvitation(db(tx),token,{store_name:'مسودة'},false,secret)).resolves.toMatchObject({status:'draft'});
  expect(tx.$executeRaw.mock.calls[0].flat().join('')).toContain('draft');
  await expect(saveSupplierDataInvitation(db(tx),token,{store_name:'مسودة'},true,secret)).rejects.toThrow('supplier_data_validation');
  await expect(saveSupplierDataInvitation(db(tx),token,values,true,secret)).resolves.toMatchObject({status:'submitted'});
 });
 it('keeps a safe but temporarily invalid value in the draft so the supplier can correct it later',async()=>{
  const token='C'.repeat(43),row={supplier_id:7n,generation:1,status:'open',expires_at:new Date(Date.now()+10000)},tx={$queryRaw:vi.fn().mockResolvedValue([row]),$executeRaw:vi.fn().mockResolvedValue(1)};
  await saveSupplierDataInvitation(db(tx),token,{store_name:'مسودة',email:'غير مكتمل'},false,secret);
  const encrypted=tx.$executeRaw.mock.calls[0].flat().find(value=>typeof value==='string'&&value.split('.').length===3) as string;
  expect(decryptInvitationDraft(encrypted,7n,1,secret)).toMatchObject({store_name:'مسودة',email:'غير مكتمل'});
 });

 it('revokes the current generation and reissue increments generation so old links cannot resolve',async()=>{
  const revoked={$queryRaw:vi.fn().mockResolvedValueOnce([{generation:4}]),$executeRaw:vi.fn().mockResolvedValue(1)};
  await revokeSupplierDataInvitation(db(revoked),7n,3n);
  expect(revoked.$executeRaw.mock.calls[0].flat().join('')).toContain('revoked');
  const reissued={$queryRaw:vi.fn().mockResolvedValueOnce([{id:7n,name:'متجر'}]).mockResolvedValueOnce([{generation:4}]),$executeRaw:vi.fn().mockResolvedValue(1)};
  const issued=await issueSupplierDataInvitation(db(reissued),7n,3n,secret,'https://trbhh.sa');
  expect(issued.generation).toBe(5);
 });
});

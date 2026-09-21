import {describe,it,expect,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import {approveSubmittedSupplierData,reopenSupplierDataInvitation,encryptInvitationDraft} from '@/lib/suppliers/data-invitations';
const secret='ab'.repeat(32),values={establishment_name:'شركة',store_name:'متجر',store_url:'https://salla.sa/store',registration_number:'1010123456',contact_name:'محمد',phone:'+966501234567',email:'owner@example.com'};
const db=(tx:object)=>({$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb);
describe('supplier data admin lifecycle',()=>{
 it('approves only the exact submitted generation and applies its complete values inside the lock',async()=>{
  const row={supplier_id:7n,generation:2,status:'submitted',encrypted_draft:encryptInvitationDraft(values,7n,2,secret),expires_at:new Date(Date.now()+10000)};
  const tx={$queryRaw:vi.fn().mockResolvedValue([row]),$executeRaw:vi.fn().mockResolvedValue(1)},apply=vi.fn().mockResolvedValue(undefined);
  await expect(approveSubmittedSupplierData(db(tx),7n,2,3n,secret,apply)).resolves.toEqual({status:'approved'});
  expect(apply).toHaveBeenCalledWith(tx,values);
  expect(tx.$executeRaw.mock.calls[0].flat().join('')).toContain('approved');
 });
 it('refuses draft or stale generations without applying supplier changes',async()=>{
  const row={supplier_id:7n,generation:3,status:'draft',encrypted_draft:encryptInvitationDraft(values,7n,3,secret),expires_at:new Date(Date.now()+10000)};
  const tx={$queryRaw:vi.fn().mockResolvedValue([row]),$executeRaw:vi.fn()},apply=vi.fn();
  await expect(approveSubmittedSupplierData(db(tx),7n,2,3n,secret,apply)).rejects.toThrow('supplier_data_review_stale');expect(apply).not.toHaveBeenCalled();
 });
 it('returns a submitted invitation to draft without changing its token generation',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([{generation:2,status:'submitted'}]),$executeRaw:vi.fn().mockResolvedValue(1)};
  await expect(reopenSupplierDataInvitation(db(tx),7n,2,3n)).resolves.toEqual({status:'draft'});
  const call=tx.$executeRaw.mock.calls[0].flat().join('');expect(call).toContain("status='draft'");expect(call).not.toContain('generation=generation+1');
 });
});

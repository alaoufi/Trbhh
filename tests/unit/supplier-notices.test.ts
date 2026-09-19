import {describe,it,expect,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import {deliverSupplierNotices} from '@/lib/suppliers/tracking';
describe('shipping legacy inbox bridge',()=>{
 it.each([0,21,-1,1.5])('rejects unbounded/invalid limit %s',async limit=>{
  const db={$transaction:vi.fn()} as unknown as CommerceDb;await expect(deliverSupplierNotices(db,limit)).rejects.toThrow();expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('uses locked owner/receipt selection and generic configured text, not payload',async()=>{
  const writes:{sql:string;values:unknown[]}[]=[];
  const query=vi.fn(async(s:TemplateStringsArray)=>s.join('?').includes('site_settings')?[{v:'Custom shipping notice'}]:[{id:1n,order_id:2n,member_id:3n}]);
  const tx={$queryRaw:query,$executeRaw:vi.fn(async(s:TemplateStringsArray,...values:unknown[])=>{writes.push({sql:s.join('?'),values});return 1;})};
  const db={$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)} as unknown as CommerceDb;
  expect(await deliverSupplierNotices(db,20)).toBe(1);
  const select=query.mock.calls.find(c=>c[0].join('?').includes('commerce_notifications'))![0].join('?');
  expect(select).toContain('FOR UPDATE SKIP LOCKED');expect(select).toContain('commerce_receipts');expect(select).toContain("CONCAT('member:',o.member_id)");
  expect(writes[0].sql).toContain('INSERT INTO notfications');expect(writes[0].values).toEqual(['Custom shipping notice','/account/orders/2','3']);
  expect(writes[1].sql).toContain("status='sent'");
 });
});

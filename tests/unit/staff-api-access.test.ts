import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({uid:7 as number|null,keys:new Set<string>(),issue:vi.fn(),readInvoice:vi.fn(),readFinance:vi.fn(),recordExport:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:async()=>state.uid?{uid:state.uid}:null}));
vi.mock('@/lib/access-control/guards',()=>({
  readActorAccess:async()=>({keys:state.keys,ready:true,roles:[]}),
  hasAccess:async(uid:number,module:string,action:string)=>uid===state.uid&&state.keys.has(`${module}:${action}`),
  requireAccess:async(module:string,action:string)=>{if(!state.uid||!state.keys.has(`${module}:${action}`))throw Error('DENIED');return {uid:state.uid};},
}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/suppliers/config',()=>({supplierConfig:()=>({origin:'https://app.test'})}));
vi.mock('@/lib/suppliers/merchant-oauth',()=>({issueMerchantInvitation:state.issue}));
vi.mock('@/lib/finance/read-model',()=>({readFinanceData:state.readFinance}));
vi.mock('@/lib/finance/documents',()=>({readFinanceInvoice:state.readInvoice,customerInvoice:(invoice:unknown)=>invoice}));
vi.mock('@/lib/finance/service',()=>({recordFinanceExport:state.recordExport}));
import { POST as invite } from '@/app/api/integrations/salla/invite/route';
import { GET as backup } from '@/app/admin/backup/download/route';
import { GET as financeExport } from '@/app/admin/finance/export/route';
import { NextRequest } from 'next/server';
beforeEach(()=>{state.uid=7;state.keys=new Set();vi.clearAllMocks();state.issue.mockResolvedValue({url:'https://app.test/consent',expiresAt:new Date('2026-10-01')});});
describe('staff HTTP boundaries',()=>{
  it('supplier maintenance cannot mint an OAuth merchant consent link',async()=>{
    state.keys.add('suppliers:edit');
    const response=await invite(new NextRequest('https://app.test/api/integrations/salla/invite',{method:'POST',headers:{origin:'https://app.test'},body:new URLSearchParams({supplierId:'1',adminId:'999'})}));
    expect(response.status).toBe(403);expect(state.issue).not.toHaveBeenCalled();
  });
  it('OAuth invitation uses the verified actor, ignoring caller supplied identity',async()=>{
    state.keys.add('integrations:authorize');
    const response=await invite(new NextRequest('https://app.test/api/integrations/salla/invite',{method:'POST',headers:{origin:'https://app.test'},body:new URLSearchParams({supplierId:'1',adminId:'999'})}));
    expect(response.status).toBe(200);expect(state.issue.mock.calls[0]?.[2]).toBe(7n);
  });
  it('backup view cannot download the database',async()=>{
    state.keys.add('backup:view');
    const response=await backup(new NextRequest('https://app.test/admin/backup/download?name=backup.sql'));
    expect(response.status).toBe(403);
  });
  it('budget export cannot be changed to invoice printing through invoiceId',async()=>{
    state.keys=new Set(['budget:view','budget:export']);
    await expect(financeExport(new Request('https://app.test/admin/finance/export?section=budget&format=print&invoiceId=1'))).rejects.toThrow('DENIED');
    expect(state.readInvoice).not.toHaveBeenCalled();expect(state.readFinance).not.toHaveBeenCalled();expect(state.recordExport).not.toHaveBeenCalled();
  });
  it('financial view alone never authorizes downloading reports',async()=>{
    state.keys=new Set(['finance:view','invoices:view']);
    await expect(financeExport(new Request('https://app.test/admin/finance/export?section=invoices&format=xlsx'))).rejects.toThrow('DENIED');
    expect(state.readFinance).not.toHaveBeenCalled();
  });
});

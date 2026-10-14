import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),list:vi.fn(),batch:vi.fn(),batches:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mocks.access}));
vi.mock('@/lib/cj/settlements',()=>({listCjPayables:mocks.list,getCjSettlementBatch:mocks.batch,getCjSettlementWaitHours:async()=>24,listCjSettlementBatches:mocks.batches}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/components/cj/admin-nav',()=>({CjAdminNav:()=>null}));
vi.mock('@/app/admin/suppliers/cj/payables/actions',()=>({refreshSettlement:vi.fn(),saveSettlementWait:vi.fn(),authorizeWalletSettlement:vi.fn(),prepareSettlement:vi.fn()}));
import Page from '@/app/admin/suppliers/cj/payables/page';
describe('staff-only CJ accounting board',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({uid:7});mocks.list.mockResolvedValue([]);mocks.batch.mockResolvedValue(null);mocks.batches.mockResolvedValue([]);});
  it('denies financial disclosure before any supplier ledger query',async()=>{
    mocks.access.mockImplementation(async(module:string)=>{if(module==='wallets')throw Error('access_denied');return {uid:7};});
    await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('access_denied');expect(mocks.list).not.toHaveBeenCalled();expect(mocks.batch).not.toHaveBeenCalled();expect(mocks.batches).not.toHaveBeenCalled();
  });
  it('shows independent accounting statuses and hides expired card links',async()=>{
    mocks.batches.mockResolvedValue([{id:'8',status:'prepared',totalUsdMinor:3210}]);
    mocks.batch.mockResolvedValue({id:'8',status:'prepared',totalUsdMinor:3210,lines:[{id:'2',commerceOrderId:'99',cjOrderId:'CJ123',status:'unpaid',totalUsdMinor:3210,paymentUrl:'https://www.cjdropshipping.com/mine/payment?pid=fixture',payExpiresAt:new Date(0)}]});
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({batch:'8'})}));
    expect(html).toContain('مستحقات CJ');expect(html).toContain('$32.10');expect(html).toContain('لم يثبت سداد المورد');expect(html).not.toContain('pid=fixture');expect(html).toContain('expectedTotalUsdMinor');expect(html).toContain('confirmWalletDebit');expect(html).toContain('لا نفترض وجود رابط بطاقة واحد');
  });
  it('does not offer wallet authorization or payment link for supplier-paid requests',async()=>{
    mocks.batch.mockResolvedValue({id:'8',status:'settled',totalUsdMinor:3210,lines:[{id:'2',commerceOrderId:'99',cjOrderId:'CJ123',status:'paid',totalUsdMinor:3210,paymentUrl:null,payExpiresAt:null}]});
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({batch:'8'})}));expect(html).toContain('سداد المورد مؤكد');expect(html).not.toContain('confirmWalletDebit');
  });
});

import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),prepare:vi.fn(),refresh:vi.fn(),setting:vi.fn(),authorize:vi.fn(),batch:vi.fn(),supplierRead:vi.fn(),cardPrepare:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error(url);}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mocks.access}));
vi.mock('@/lib/settings',()=>({setSetting:mocks.setting}));
vi.mock('@/lib/cj/settlements',()=>({prepareCjSettlementBatch:mocks.prepare,reconcileCjSettlementBatch:mocks.refresh,getCjSettlementBatch:mocks.batch,authorizeCjSettlementWalletBatch:mocks.authorize}));
vi.mock('@/lib/cj/fulfillment',()=>({reconcileCjFulfillmentPayment:mocks.supplierRead,prepareCjFulfillmentCardPayment:mocks.cardPrepare}));
import {prepareSettlement,saveSettlementWait,authorizeWalletSettlement,refreshSettlement,prepareUnpaidSupplierOrder} from '@/app/admin/suppliers/cj/payables/actions';
function form(){const data=new FormData();data.append('fulfillmentId','2');data.set('reviewed','1');data.set('requestKey','12345678-1234-4234-8234-123456789abc');return data;}
describe('CJ settlement actions authority',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({uid:7});mocks.prepare.mockResolvedValue({id:'8'});});
  it('requires order view/edit and financial view before recording batch',async()=>{
    await expect(prepareSettlement(form())).rejects.toThrow('?batch=8');
    expect(mocks.access.mock.calls).toEqual([['orders','view'],['orders','edit'],['wallets','view']]);
    expect(mocks.prepare).toHaveBeenCalledWith(['2'],7n,'12345678-1234-4234-8234-123456789abc');
  });
  it('rejects unauthorized actions before financial reads/writes',async()=>{
    mocks.access.mockRejectedValueOnce(Error('access_denied'));await expect(prepareSettlement(form())).rejects.toThrow('access_denied');expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('requires explicit review and rejects duplicate selection before backend',async()=>{
    const unconfirmed=form();unconfirmed.delete('reviewed');await expect(prepareSettlement(unconfirmed)).rejects.toThrow('confirmation');
    const duplicate=form();duplicate.append('fulfillmentId','2');await expect(prepareSettlement(duplicate)).rejects.toThrow('selection');expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('protects bounded wait settings with existing settings permission',async()=>{
    const data=new FormData();data.set('hours','24');await expect(saveSettlementWait(data)).rejects.toThrow('saved=1');expect(mocks.access).toHaveBeenCalledWith('integrations','manage_settings');expect(mocks.setting).toHaveBeenCalledWith('cj_settlement_max_wait_hours','24');
  });
  it('does not queue any financial authority without explicit bounded amount confirmation',async()=>{
    const data=new FormData();data.set('batchId','8');data.set('expectedTotalUsdMinor','1234');
    await expect(authorizeWalletSettlement(data)).rejects.toThrow('wallet_confirmation');expect(mocks.authorize).not.toHaveBeenCalled();
    data.set('confirmWalletDebit','1');data.set('expectedTotalUsdMinor','1e5');await expect(authorizeWalletSettlement(data)).rejects.toThrow('selection');expect(mocks.authorize).not.toHaveBeenCalled();
    data.set('expectedTotalUsdMinor','1234');await expect(authorizeWalletSettlement(data)).rejects.toThrow('authorized=1');expect(mocks.access).toHaveBeenCalledWith('wallets','edit');expect(mocks.authorize).toHaveBeenCalledWith('8',7n,1234);
  });
  it('rejects changed totals without claiming payment and refreshes each unpaid request read only',async()=>{
    mocks.authorize.mockRejectedValueOnce(Error('changed'));
    const data=new FormData();data.set('batchId','8');data.set('expectedTotalUsdMinor','1234');data.set('confirmWalletDebit','1');await expect(authorizeWalletSettlement(data)).rejects.toThrow('wallet_changed');
    mocks.batch.mockResolvedValueOnce({lines:[{id:'2',status:'unpaid'},{id:'3',status:'paid'},{id:'4',status:'unpaid'}]});await expect(refreshSettlement(data)).rejects.toThrow('refreshed=1');expect(mocks.supplierRead.mock.calls).toEqual([['2'],['4']]);expect(mocks.refresh).toHaveBeenCalledWith('8');
  });
  it('keeps successful independent reconciliation when another request cannot be read',async()=>{
    mocks.batch.mockResolvedValueOnce({lines:[{id:'2',status:'unpaid'},{id:'4',status:'unpaid'}]});mocks.supplierRead.mockRejectedValueOnce(Error('timeout'));
    const data=new FormData();data.set('batchId','8');await expect(refreshSettlement(data)).rejects.toThrow('error=refresh');expect(mocks.supplierRead.mock.calls).toEqual([['2'],['4']]);expect(mocks.refresh).toHaveBeenCalledWith('8');
  });
  it('prepares unpaid card flow only after confirmation and never invokes wallet authority',async()=>{
    const data=new FormData();data.set('fulfillmentId','8');await expect(prepareUnpaidSupplierOrder(data)).rejects.toThrow('confirmation');expect(mocks.cardPrepare).not.toHaveBeenCalled();
    data.set('confirmUnpaid','1');await expect(prepareUnpaidSupplierOrder(data)).rejects.toThrow('prepared=1');expect(mocks.cardPrepare).toHaveBeenCalledWith('8');expect(mocks.authorize).not.toHaveBeenCalled();
  });
});

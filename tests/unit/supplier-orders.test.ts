import {describe,it,expect,vi} from 'vitest';
import {dispatchSupplierOrder} from '@/lib/suppliers/orders';
import type {CommerceDb} from '@/lib/commerce/types';
import {supplierConfig} from '@/lib/suppliers/config';
const config=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa'});
describe('supplier order dispatch gates',()=>{
 it('does not dispatch an order without a verified receipt',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;expect(await dispatchSupplierOrder(db,1n,config)).toEqual({status:'ineligible'});expect(tx.$executeRaw).not.toHaveBeenCalled();});
 it('does not reclaim submitted or unknown orders',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([{status:'unknown'}]),$executeRaw:vi.fn()};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;expect(await dispatchSupplierOrder(db,1n,config)).toEqual({status:'ineligible'});expect(tx.$executeRaw).not.toHaveBeenCalled();});
});

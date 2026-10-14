import {describe,it,expect} from 'vitest';
import {settlementIds,supplierAmounts} from '@/lib/cj/settlements/policy';
describe('CJ settlement immutable accounting',()=>{
 it('prepares ten synthetic order commitments without API calls or debit',()=>{const ids=settlementIds(Array.from({length:10},(_,i)=>String(i+1)));expect(ids).toHaveLength(10);const values=ids.map(()=>supplierAmounts({lines:[{quantity:2,supplierUnitUsdMinor:500}],supplierFreightUsdMinor:250,supplierTaxUsdMinor:50,supplierUsdMinor:1300}));expect(values.reduce((a,b)=>a+b.totalUsdMinor,0)).toBe(13000);expect(values[0]).toEqual({productUsdMinor:1000,shippingUsdMinor:250,taxUsdMinor:50,totalUsdMinor:1300});});
 it('rejects duplicate aliases and oversized selections',()=>{expect(()=>settlementIds(['1','01'])).toThrow();expect(()=>settlementIds(Array.from({length:21},(_,i)=>String(i+1)))).toThrow();});
 it.each(['0','-1','1e2','18446744073709551616'])('rejects unsafe identifier %s',id=>expect(()=>settlementIds([id])).toThrow());
 it('rejects corrupted immutable total and negative freight',()=>{const q={lines:[{quantity:1,supplierUnitUsdMinor:500}],supplierFreightUsdMinor:250,supplierTaxUsdMinor:0,supplierUsdMinor:750};expect(()=>supplierAmounts({...q,supplierUsdMinor:751})).toThrow();expect(()=>supplierAmounts({...q,supplierFreightUsdMinor:-1})).toThrow();});
});

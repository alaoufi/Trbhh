import {describe,it,expect} from 'vitest';
import {journeyStage} from '../../src/lib/cj/journey-stage';
describe('CJ journey proof boundaries',()=>{
const paid={receiptVerified:true,supplierStatus:'supplier_paid',orderStage:'processing'};
it('requires customer and supplier proof',()=>{expect(journeyStage({...paid,receiptVerified:false,shipmentStage:'delivered'})).toBe('purchases');expect(journeyStage({...paid,supplierStatus:'payment_ready'})).toBe('purchases');});
it('separates preparation and shipment',()=>{expect(journeyStage(paid)).toBe('preparation');expect(journeyStage({...paid,shipmentStage:'shipped'})).toBe('tracking');});
it('requires completed order and delivered shipment for history',()=>{expect(journeyStage({...paid,shipmentStage:'delivered'})).toBe('tracking');expect(journeyStage({...paid,orderStage:'completed',shipmentStage:'delivered'})).toBe('history');});
it('keeps supplier exceptions actionable',()=>{expect(journeyStage({...paid,orderStage:'completed',shipmentStage:'delivered',actionRequired:true})).toBe('purchases');});
});

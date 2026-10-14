import {describe,it,expect} from 'vitest';
import {supplierStageFromProof,safeTrackingUrl} from '@/lib/cj/fulfillment/status';
describe('CJ fulfillment source events',()=>{
 it('paid never means preparation',()=>expect(supplierStageFromProof({orderStatus:'PAID'})).toBeNull());
 it('requires actual processing evidence for preparing',()=>expect(supplierStageFromProof({orderStatus:'UNSHIPPED',subStatus:'PROCESSING'})).toBe('preparing'));
 it('requires tracking for shipped and does not infer delivery',()=>{expect(supplierStageFromProof({orderStatus:'SHIPPED'})).toBeNull();expect(supplierStageFromProof({orderStatus:'SHIPPED',trackNumber:'T'})).toBe('shipped');expect(supplierStageFromProof({orderStatus:'SHIPPED',trackNumber:'T',isComplete:1})).toBe('shipped');});
 it('delivered requires explicit actual CJ delivered event',()=>{expect(supplierStageFromProof({orderStatus:'DELIVERED',trackNumber:'T'})).toBe('delivered');expect(supplierStageFromProof({orderStatus:'COMPLETED',trackNumber:'T'})).toBeNull();});
 it('rejects unsafe tracking URLs',()=>{expect(safeTrackingUrl('javascript:alert(1)')).toBeNull();expect(safeTrackingUrl('https://user:pass@example.com')).toBeNull();expect(safeTrackingUrl('https://127.0.0.1')).toBeNull();expect(safeTrackingUrl('https://carrier.example/track/T')).toBe('https://carrier.example/track/T');});
});

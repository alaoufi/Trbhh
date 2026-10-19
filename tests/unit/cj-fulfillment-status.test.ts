import {describe,it,expect} from 'vitest';
import {supplierStageFromProof,safeTrackingUrl,cjShipmentException,cjPaidProgressException} from '@/lib/cj/fulfillment/status';
describe('CJ fulfillment source events',()=>{
 it.each(['CLOSED','CANCELED'])('holds %s for review without interpreting it as a refund',status=>expect(cjShipmentException({orderStatus:status})).toBe(status));
 it.each(['UNSHIPPED','PENDING','PROCESSING'])('flags %s after 48 hours of verified CJ payment time',orderStatus=>{
  expect(cjPaidProgressException({orderStatus,paymentDate:'2026-10-01 00:00:00'},Date.parse('2026-10-03T00:00:00Z'))).toBe('CJ_PAID_PROGRESS_STALLED');
  expect(cjPaidProgressException({orderStatus,paymentDate:'2026-10-01 00:00:00'},Date.parse('2026-10-02T23:59:59Z'))).toBeNull();
 });
 it('requires valid payment time and pending progress for a stall alert',()=>{
  const now=Date.parse('2026-10-03T00:00:00Z');
  for(const paymentDate of [undefined,'invalid','2026-02-30 00:00:00','2026-10-04 00:00:00'])expect(cjPaidProgressException({orderStatus:'UNSHIPPED',paymentDate},now)).toBeNull();
  expect(cjPaidProgressException({orderStatus:'SHIPPED',paymentDate:'2026-10-01 00:00:00'},now)).toBeNull();
 });
 it.each(['REFUNDED','REFUNDING','REFUND_PENDING'])('holds authenticated %s signals instead of silently retaining delivery success',status=>expect(cjShipmentException({orderStatus:status})).toBe(status));
 it.each(['OUT_FOR_DELIVERY','AVAILABLE_FOR_PICKUP','UNSUCCESSFUL_DELIVERY_ATTEMPT','RETURNED_TO_SENDER'])('never treats %s as delivered',status=>expect(supplierStageFromProof({orderStatus:status})).toBeNull());
 it('holds disputes and failed deliveries for review, without interpreting an attempted delivery as success',()=>{expect(cjShipmentException({disputeId:'D1'})).toBe('CJ_DISPUTE_OPEN');expect(cjShipmentException({},'Unsuccessful delivery attempt')).toBe('DELIVERY_EXCEPTION');expect(cjShipmentException({},'Returned to sender')).toBe('DELIVERY_EXCEPTION');expect(cjShipmentException({},'Out for delivery')).toBeNull();});
 it('paid never means preparation',()=>expect(supplierStageFromProof({orderStatus:'PAID'})).toBeNull());
 it('requires actual processing evidence for preparing',()=>expect(supplierStageFromProof({orderStatus:'UNSHIPPED',subStatus:'PROCESSING'})).toBe('preparing'));
 it('requires tracking for shipped and does not infer delivery',()=>{expect(supplierStageFromProof({orderStatus:'SHIPPED'})).toBeNull();expect(supplierStageFromProof({orderStatus:'SHIPPED',trackNumber:'T'})).toBe('shipped');expect(supplierStageFromProof({orderStatus:'SHIPPED',trackNumber:'T',isComplete:1})).toBe('shipped');});
 it('delivered requires explicit actual CJ delivered event',()=>{expect(supplierStageFromProof({orderStatus:'DELIVERED',trackNumber:'T'})).toBe('delivered');expect(supplierStageFromProof({orderStatus:'COMPLETED',trackNumber:'T'})).toBe('delivered');});
 it('rejects unsafe tracking URLs',()=>{expect(safeTrackingUrl('javascript:alert(1)')).toBeNull();expect(safeTrackingUrl('https://user:pass@example.com')).toBeNull();expect(safeTrackingUrl('https://127.0.0.1')).toBeNull();expect(safeTrackingUrl('https://carrier.example/track/T')).toBe('https://carrier.example/track/T');});
});

import {expect,it} from 'vitest';
import {customerFulfillmentText,customerShipment} from '@/lib/commerce/customer-fulfillment';
it('replaces supplier identity in old configured customer messages',()=>{
 expect(customerFulfillmentText('تم دفع CJ للمورد','تربح تتابع طلبك')).toBe('تربح تتابع طلبك');
 expect(customerFulfillmentText('طلبك قيد التجهيز','fallback')).toBe('طلبك قيد التجهيز');
});
it('keeps real tracking numbers but hides supplier brand and supplier portals',()=>{
 expect(customerShipment({carrier:'CJPacket',trackingNumber:'CJ123',trackingUrl:'https://www.cjpacket.com/'})).toEqual({carrier:'خدمة التوصيل',trackingNumber:'CJ123',trackingUrl:null});
 expect(customerShipment({carrier:'SMSA',trackingNumber:'123',trackingUrl:'https://www.smsaexpress.com/track'})).toEqual({carrier:'SMSA',trackingNumber:'123',trackingUrl:'https://www.smsaexpress.com/track'});
 expect(customerShipment({carrier:'Carrier',trackingUrl:'javascript:alert(1)'}).trackingUrl).toBeNull();
});

import {saudiCommercePhone} from '@/lib/commerce/config';
import type {SupplierOrderRequest} from './types';

export function normalizeStoreCoordinatorPhone(value:string):string {
  if(!value.trim())return '';
  const phone=saudiCommercePhone(value);
  if(!phone)throw new Error('supplier_coordinator_phone');
  return `+${phone}`;
}

type CoordinatorMessageInput={
  trbhhOrderId:string;
  sallaOrderId:string;
  sallaOrderUrl:string;
  shipping:SupplierOrderRequest['shipping'];
  items:SupplierOrderRequest['items'];
  shippingNotes?:string;
};

function safeOrderUrl(value:string):string {
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('supplier_coordinator_order_url');}
  if(url.protocol!=='https:'||url.hostname!=='s.salla.sa'||!url.pathname.startsWith('/orders/order/')||url.username||url.password||url.port)throw new Error('supplier_coordinator_order_url');
  return url.href;
}

/** Builds only the operational minimum. It must be materialized by a delivery
 * worker after a paid receipt and a submitted Salla order; it is never stored
 * as the notification outbox payload. */
export function buildCoordinatorOrderMessage(input:CoordinatorMessageInput):string {
  if(!/^[1-9]\d*$/.test(input.trbhhOrderId)||!/^[1-9]\d*$/.test(input.sallaOrderId))throw new Error('supplier_coordinator_order_id');
  const items=input.items.map(item=>{
    const title=(item.name||item.sku||`منتج ${item.externalId}`).trim();
    return `- ${title} × ${item.quantity}${item.variantName?` — ${item.variantName}`:''}`;
  }).join('\n');
  const address=[input.shipping.city,input.shipping.addressLine,input.shipping.postalCode].filter(Boolean).join('، ');
  return [
    `طلب جديد للتجهيز — طلب تربح #${input.trbhhOrderId}`,
    `طلب سلة #${input.sallaOrderId}`,
    `العميل: ${input.shipping.name}`,
    `جوال التوصيل: ${input.shipping.phone}`,
    `العنوان: ${address}`,
    'المنتجات:',items,
    input.shippingNotes?`ملاحظات الشحن: ${input.shippingNotes}`:'',
    `مرجع الطلب: ${safeOrderUrl(input.sallaOrderUrl)}`,
  ].filter(Boolean).join('\n');
}

export type CoordinatorNotificationChannel='sms'|'whatsapp';
export interface CoordinatorNotifier {
  readonly channel:CoordinatorNotificationChannel;
  send(input:{recipient:string;message:string;deduplicationKey:string}):Promise<{providerMessageId:string}>;
}

import 'server-only';
import type {Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {validateLiveCjQuote,type LiveCjQuote} from './live-quote';
import {canonicalCjDestination,assertSaudiCjCheckoutAddress} from './live-destination';
type Tx=Prisma.TransactionClient;
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
function quoteHash(value:LiveCjQuote):string{return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
export async function saveLiveCjQuote(tx:Tx,orderId:bigint,quote:LiveCjQuote,now:Date):Promise<void>{
 validateLiveCjQuote(quote,quote.destination,now);
 const serialized=JSON.stringify(quote),hash=quoteHash(quote);
 await tx.$executeRaw`INSERT INTO commerce_cj_order_quotes (commerce_order_id,fulfillment_group,quote_hash,quote_json) VALUES (${orderId},${quote.fulfillmentGroup},${hash},${serialized})`;
}
/** Caller must use the SAME transaction as verified bank receipt settlement. */
export async function enqueuePaidCjFulfillment(tx:Tx,orderId:bigint):Promise<void>{
 await tx.$executeRaw`INSERT INTO commerce_cj_fulfillment_outbox (commerce_order_id,fulfillment_group,quote_json,supplier_reference)
 SELECT q.commerce_order_id,q.fulfillment_group,q.quote_json,JSON_UNQUOTE(JSON_EXTRACT(q.quote_json,'$.supplierReference'))
 FROM commerce_cj_order_quotes q JOIN commerce_orders o ON o.id=q.commerce_order_id
 JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency='SAR'
 WHERE o.id=${orderId} AND o.status='paid' AND o.currency='SAR'
 ON DUPLICATE KEY UPDATE id=commerce_cj_fulfillment_outbox.id`;
}
export async function requireLiveCjQuotesAtPayment(tx:Tx,orderId:bigint,now:Date):Promise<void>{
 const sources=await tx.$queryRaw<{product_id:bigint;quantity:number;variant_key:string;shipping:unknown;total_minor:number}[]>`SELECT i.product_id,i.quantity,i.variant_key,o.shipping,o.total_minor FROM commerce_order_items i JOIN commerce_orders o ON o.id=i.order_id WHERE i.order_id=${orderId} AND (EXISTS (SELECT 1 FROM cj_products p WHERE p.commerce_product_id=i.product_id) OR EXISTS (SELECT 1 FROM commerce_cj_order_quotes q WHERE q.commerce_order_id=o.id))`;
 if(!sources.length)return;
 const rows=await tx.$queryRaw<{quote_json:unknown;quote_hash:string}[]>`SELECT quote_json,quote_hash FROM commerce_cj_order_quotes WHERE commerce_order_id=${orderId}`;
 const lines:LiveCjQuote['lines']=[];
 let customerTotal=0;
 const shipping=(typeof sources[0].shipping==='string'?JSON.parse(sources[0].shipping):sources[0].shipping) as Record<string,string>;
 for(const row of rows){
  const quote=(typeof row.quote_json==='string'?JSON.parse(row.quote_json):row.quote_json) as LiveCjQuote;
  if(quoteHash(quote)!==row.quote_hash)throw new Error('cj_quote_snapshot_changed');
  validateLiveCjQuote(quote,quote.destination,now);lines.push(...quote.lines);
  assertSaudiCjCheckoutAddress(shipping);
  const expected=canonicalCjDestination(shipping);
  if(Object.entries(expected).some(([key,value])=>quote.destination[key]!==value))throw new Error('cj_quote_destination_changed');
  customerTotal+=quote.customerSarMinor;
 }
 if(sources.length!==lines.length||sources.some(s=>!lines.some(l=>l.productId===String(s.product_id)&&l.vid===s.variant_key&&l.quantity===s.quantity)))throw new Error('cj_live_quote_required');
 if(customerTotal!==sources[0].total_minor)throw new Error('cj_quote_total_changed');
}

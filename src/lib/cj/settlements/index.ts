import 'server-only';
import {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {settlementIds,supplierAmounts,selectableStatuses,settlementPaymentReady} from './policy';
import {cjSettlementFreshnessAmount,cjPayableSelectable,cjPayableHoldReason} from './presentation';
/** Records an explicitly approved wallet instruction; this function itself never debits. */
export async function authorizeCjSettlementWalletBatch(id:string,actorId:bigint,expectedTotalUsdMinor:number){
 const [batchId]=settlementIds([id]);if(actorId<1n)throw Error('cj_batch_actor_invalid');
 return prisma.$transaction(async tx=>{
  const pointers=await tx.$queryRaw<{commerce_order_id:bigint}[]>`SELECT DISTINCT commerce_order_id FROM commerce_cj_settlement_lines WHERE batch_id=${batchId} ORDER BY commerce_order_id`;
  if(!pointers.length)throw Error('cj_batch_missing');
  for(const p of pointers)await tx.$queryRaw`SELECT id FROM commerce_orders WHERE id=${p.commerce_order_id} FOR UPDATE`;
  const rows=await tx.$queryRaw<{outbox_id:bigint;status:string;last_error:string|null;cj_order_id:string;pay_id:string|null;shipment_order_id:string|null;pay_expires_at:Date|null;quote_json:unknown;evidence_json:unknown;total_usd_minor:number;line_status:string}[]>`SELECT l.outbox_id,l.total_usd_minor,l.status AS line_status,f.status,f.last_error,f.cj_order_id,f.pay_id,f.shipment_order_id,f.pay_expires_at,f.quote_json,f.evidence_json FROM commerce_cj_settlement_lines l JOIN commerce_cj_fulfillment_outbox f ON f.id=l.outbox_id AND f.cj_order_id=l.cj_order_id JOIN commerce_orders o ON o.id=l.commerce_order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE l.batch_id=${batchId} AND o.status='paid' AND o.currency='SAR' ORDER BY f.id FOR UPDATE`;
  const [count]=await tx.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_cj_settlement_lines WHERE batch_id=${batchId}`;
  if(rows.length!==Number(count.n)||!Number.isSafeInteger(expectedTotalUsdMinor)||expectedTotalUsdMinor<1||rows.reduce((n,r)=>n+r.total_usd_minor,0)!==expectedTotalUsdMinor)throw Error('cj_batch_not_payable');
  for(const row of rows){
   const meta=(typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json) as {payment?:{payableUsdMinor?:number;payId?:string;shipmentOrderId?:string}}|null;
   if(row.line_status==='paid'||!settlementPaymentReady(row,row.total_usd_minor)||row.status!=='payment_ready'||!row.pay_id||!row.shipment_order_id||!row.pay_expires_at||supplierAmounts(row.quote_json).totalUsdMinor!==row.total_usd_minor||meta?.payment?.payableUsdMinor!==row.total_usd_minor||meta.payment.payId!==row.pay_id||meta.payment.shipmentOrderId!==row.shipment_order_id)throw Error('cj_wallet_instruction_stale');
   // Repeating the same authorization is harmless; an expired grant cannot bind a refreshed payment silently.
   const grants=await tx.$queryRaw<{pay_id:string;shipment_order_id:string;expected_usd_minor:number;status:string}[]>`SELECT pay_id,shipment_order_id,expected_usd_minor,status FROM commerce_cj_settlement_wallet_grants WHERE outbox_id=${row.outbox_id} FOR UPDATE`;
   if(grants.length){if(grants[0].status!=='authorized'||grants[0].pay_id!==row.pay_id||grants[0].shipment_order_id!==row.shipment_order_id||grants[0].expected_usd_minor!==row.total_usd_minor)throw Error('cj_wallet_instruction_conflict');continue;}
   await tx.$executeRaw`INSERT INTO commerce_cj_settlement_wallet_grants(outbox_id,batch_id,actor_id,pay_id,shipment_order_id,expected_usd_minor,expires_at) VALUES(${row.outbox_id},${batchId},${actorId},${row.pay_id},${row.shipment_order_id},${row.total_usd_minor},${row.pay_expires_at})`;
  }
  return {queuedCount:rows.length};
 },{timeout:15000});
}
export async function getCjSettlementWalletAuthorization(id:string){const [outboxId]=settlementIds([id]);const [grant]=await prisma.$queryRaw<{pay_id:string;shipment_order_id:string;expected_usd_minor:number;actor_id:bigint}[]>`SELECT g.pay_id,g.shipment_order_id,g.expected_usd_minor,g.actor_id FROM commerce_cj_settlement_wallet_grants g JOIN commerce_cj_fulfillment_outbox f ON f.id=g.outbox_id JOIN commerce_cj_settlement_lines l ON l.outbox_id=f.id AND l.batch_id=g.batch_id WHERE g.outbox_id=${outboxId} AND g.status='authorized' AND g.expires_at>CURRENT_TIMESTAMP(3) AND f.pay_expires_at>CURRENT_TIMESTAMP(3) AND f.pay_id=g.pay_id AND f.shipment_order_id=g.shipment_order_id AND f.status='payment_ready' AND l.status='pending' AND l.total_usd_minor=g.expected_usd_minor`;return grant?{payId:grant.pay_id,shipmentOrderId:grant.shipment_order_id,expectedUsdMinor:grant.expected_usd_minor,actorId:grant.actor_id}:null;}
type Row={id:bigint;commerce_order_id:bigint;cj_order_id:string|null;status:string;quote_json:unknown;paid_at:Date;pay_id?:string|null;shipment_order_id?:string|null;pay_expires_at:Date|null;last_error?:string|null;evidence_json?:unknown};
export async function listCjSettlementBatches(){const rows=await prisma.$queryRaw<{id:bigint;status:string;total_usd_minor:number;created_at:Date}[]>`SELECT id,status,total_usd_minor,created_at FROM commerce_cj_settlement_batches ORDER BY id DESC LIMIT 20`;return rows.map(b=>({id:String(b.id),status:b.status,totalUsdMinor:b.total_usd_minor,createdAt:b.created_at}));}
export async function getCjSettlementWaitHours(){const setting=await prisma.site_settings.findUnique({where:{k:'cj_settlement_max_wait_hours'},select:{v:true}});const n=Number(setting?.v);return Number.isInteger(n)&&n>=1&&n<=168?n:24;}
function payable(row:Row,hours:number){const amounts=supplierAmounts(row.quote_json);const actualUsdMinor=cjSettlementFreshnessAmount(row.evidence_json);const lastError=row.last_error||null;return {id:String(row.id),commerceOrderId:String(row.commerce_order_id),cjOrderId:row.cj_order_id,status:row.status,...amounts,actualUsdMinor,lastError,holdReason:cjPayableHoldReason(row.status,lastError),selectable:cjPayableSelectable({status:row.status,cjOrderId:row.cj_order_id,lastError,payExpiresAt:row.pay_expires_at,totalUsdMinor:amounts.totalUsdMinor,actualUsdMinor}),paidAt:row.paid_at,overdue:Date.now()-new Date(row.paid_at).getTime()>=hours*3600000,paymentUrl:null,payExpiresAt:row.pay_expires_at};}
export async function listCjPayables(){const hours=await getCjSettlementWaitHours();const rows=await prisma.$queryRaw<Row[]>`SELECT f.*,r.recorded_at AS paid_at FROM commerce_cj_fulfillment_outbox f JOIN commerce_orders o ON o.id=f.commerce_order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE o.status='paid' AND o.currency='SAR' AND f.status IN ('pending','creating','create_uncertain','created','parent_claimed','parent_uncertain','payment_ready','debit_claimed','debit_uncertain','blocked') AND NOT EXISTS(SELECT 1 FROM commerce_cj_settlement_lines l WHERE l.outbox_id=f.id) ORDER BY r.recorded_at,f.id LIMIT 200`;return rows.map(row=>payable(row,hours));}
/** Metadata reservation only: no CJ API call, debit or payment authorization. */
export async function prepareCjSettlementBatch(ids:string[],actorId:bigint,requestKey:string){
 const selected=settlementIds(ids);if(actorId<1n||!/^[A-Za-z0-9_-]{16,80}$/.test(requestKey))throw Error('cj_batch_request_invalid');
 const fingerprint=selected.join(',');
 return prisma.$transaction(async tx=>{
  // Lock every customer order before its outbox, matching the fulfillment worker.
  const pointers=await tx.$queryRaw<{commerce_order_id:bigint}[]>(Prisma.sql`SELECT DISTINCT commerce_order_id FROM commerce_cj_fulfillment_outbox WHERE id IN (${Prisma.join(selected)}) ORDER BY commerce_order_id`);
  for(const pointer of pointers)await tx.$queryRaw`SELECT id FROM commerce_orders WHERE id=${pointer.commerce_order_id} FOR UPDATE`;
  const existing=await tx.$queryRaw<{id:bigint;selection_key:string;actor_id:bigint}[]>`SELECT id,selection_key,actor_id FROM commerce_cj_settlement_batches WHERE request_key=${requestKey}`;
  if(existing[0]){if(existing[0].selection_key!==fingerprint||existing[0].actor_id!==actorId)throw Error('cj_batch_request_conflict');return {id:String(existing[0].id)};}
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT f.*,r.recorded_at AS paid_at FROM commerce_cj_fulfillment_outbox f JOIN commerce_orders o ON o.id=f.commerce_order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency WHERE f.id IN (${Prisma.join(selected)}) AND o.status='paid' AND o.currency='SAR' ORDER BY f.id FOR UPDATE`);
  if(rows.length!==selected.length||rows.some(row=>!selectableStatuses.includes(row.status as typeof selectableStatuses[number])||!row.cj_order_id||!settlementPaymentReady(row,supplierAmounts(row.quote_json).totalUsdMinor)))throw Error('cj_batch_not_payable');
  const overlap=await tx.$queryRaw<{outbox_id:bigint}[]>(Prisma.sql`SELECT outbox_id FROM commerce_cj_settlement_lines WHERE outbox_id IN (${Prisma.join(selected)}) FOR UPDATE`);if(overlap.length)throw Error('cj_batch_already_selected');
  const amounts=rows.map(row=>supplierAmounts(row.quote_json));const total=amounts.reduce((n,a)=>n+a.totalUsdMinor,0);if(!Number.isSafeInteger(total)||total>2147483647)throw Error('cj_batch_total_invalid');
  await tx.$executeRaw`INSERT INTO commerce_cj_settlement_batches(request_key,selection_key,actor_id,total_usd_minor) VALUES(${requestKey},${fingerprint},${actorId},${total})`;
  const [batch]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_cj_settlement_batches WHERE request_key=${requestKey}`;
  for(let i=0;i<rows.length;i++){const row=rows[i],a=amounts[i];await tx.$executeRaw`INSERT INTO commerce_cj_settlement_lines(batch_id,outbox_id,commerce_order_id,cj_order_id,product_usd_minor,shipping_usd_minor,tax_usd_minor,total_usd_minor) VALUES(${batch.id},${row.id},${row.commerce_order_id},${row.cj_order_id},${a.productUsdMinor},${a.shippingUsdMinor},${a.taxUsdMinor},${a.totalUsdMinor})`;}
  return {id:String(batch.id)};
 },{timeout:15000});
}
export async function getCjSettlementBatch(id:string){
 const [batchId]=settlementIds([id]);
 const [batch]=await prisma.$queryRaw<{id:bigint;status:string;total_usd_minor:number;created_at:Date}[]>`SELECT id,status,total_usd_minor,created_at FROM commerce_cj_settlement_batches WHERE id=${batchId}`;
 if(!batch)return null;
 const lines=await prisma.$queryRaw<{outbox_id:bigint;commerce_order_id:bigint;cj_order_id:string;status:string;product_usd_minor:number;shipping_usd_minor:number;tax_usd_minor:number;total_usd_minor:number;pay_id:string|null;pay_expires_at:Date|null;fulfillment_status:string;last_error:string|null;evidence_json:unknown;wallet_authorized:bigint}[]>`SELECT l.*,f.pay_id,f.pay_expires_at,f.status AS fulfillment_status,f.last_error,f.evidence_json,EXISTS(SELECT 1 FROM commerce_cj_settlement_wallet_grants g WHERE g.outbox_id=f.id AND g.status='authorized') AS wallet_authorized FROM commerce_cj_settlement_lines l JOIN commerce_cj_fulfillment_outbox f ON f.id=l.outbox_id AND f.cj_order_id=l.cj_order_id WHERE l.batch_id=${batchId} ORDER BY l.outbox_id`;
 return {id:String(batch.id),status:batch.status,totalUsdMinor:batch.total_usd_minor,createdAt:batch.created_at,lines:lines.map(l=>{
  const actualUsdMinor=cjSettlementFreshnessAmount(l.evidence_json);
  const walletAuthorized=Number(l.wallet_authorized)===1;
  const freshAmount=actualUsdMinor===null||actualUsdMinor===l.total_usd_minor;
  return {id:String(l.outbox_id),commerceOrderId:String(l.commerce_order_id),cjOrderId:l.cj_order_id,status:l.status,productUsdMinor:l.product_usd_minor,shippingUsdMinor:l.shipping_usd_minor,taxUsdMinor:l.tax_usd_minor,totalUsdMinor:l.total_usd_minor,lastError:l.last_error,actualUsdMinor,walletAuthorized,holdReason:cjPayableHoldReason(l.fulfillment_status,l.last_error),fulfillmentStatus:l.fulfillment_status,payExpiresAt:l.pay_expires_at,paymentUrl:l.status!=='paid'&&!walletAuthorized&&!l.last_error&&freshAmount&&l.fulfillment_status==='payment_ready'&&l.pay_id&&/^[A-Za-z0-9_-]{1,200}$/.test(l.pay_id)&&l.pay_expires_at&&new Date(l.pay_expires_at).getTime()>Date.now()?`https://www.cjdropshipping.com/mine/payment?pid=${encodeURIComponent(l.pay_id)}`:null};
 })};
}
/** Reflect only independently reconciled worker proof; a redirect is never payment evidence. */
export async function reconcileCjSettlementBatch(id:string){const [batchId]=settlementIds([id]);await prisma.$transaction(async tx=>{await tx.$executeRaw`UPDATE commerce_cj_settlement_lines l JOIN commerce_cj_fulfillment_outbox f ON f.id=l.outbox_id AND f.cj_order_id=l.cj_order_id SET l.status='paid',l.reconciled_at=CURRENT_TIMESTAMP(3) WHERE l.batch_id=${batchId} AND f.status='supplier_paid'`;await tx.$executeRaw`UPDATE commerce_cj_settlement_batches b SET b.status=IF(EXISTS(SELECT 1 FROM commerce_cj_settlement_lines l WHERE l.batch_id=b.id AND l.status<>'paid'),'prepared','settled') WHERE b.id=${batchId}`;});return getCjSettlementBatch(id);}

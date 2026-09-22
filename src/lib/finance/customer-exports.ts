import 'server-only';
import type {SessionPayload} from '@/lib/auth';
import type {CommerceDb} from '@/lib/commerce/types';
import {readFinanceInvoice} from './documents';
import {assertFinanceSchemaReady} from './schema';
import {auditFinance,parseFinanceId} from './service';

/** Customer print authority is ownership of this one document, never a staff export grant. */
export async function readCustomerInvoiceForPrint(db:CommerceDb,session:Pick<SessionPayload,'uid'|'authVersion'>,id:string,now=new Date()) {
  if(!Number.isSafeInteger(session.uid)||session.uid<=0||typeof session.authVersion!=='string'||!session.authVersion||session.authVersion.length>64)return null;
  const invoiceId=parseFinanceId(id),actor=BigInt(session.uid);
  await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    const [account]=await tx.$queryRaw<{auth_session_version:string;archived_at:Date|null;merged_into:bigint|null;ban:string|null;ban_until:Date|null}[]>`SELECT auth_session_version,archived_at,merged_into,ban,ban_until FROM users WHERE id=${actor} FOR UPDATE`;
    if(!account||account.archived_at||account.merged_into||account.auth_session_version!==session.authVersion||
      (account.ban==='checked'&&(!account.ban_until||account.ban_until>now)))return null;
    const [owned]=await tx.$queryRaw<{id:bigint}[]>`SELECT o.id FROM commerce_orders o INNER JOIN finance_invoices i ON i.order_id=o.id WHERE i.id=${invoiceId} AND o.member_id=${actor} FOR UPDATE`;
    if(!owned)return null;
    const invoice=await readFinanceInvoice(tx,id,session.uid);
    if(!invoice)return null;
    await auditFinance(tx,actor,'customer_invoice_printed','invoice',invoice.id,'طباعة العميل لمستنده',{after:{format:'print',orderId:invoice.orderId,number:invoice.number}},now);
    return invoice;
  },{maxWait:10000,timeout:30000,isolationLevel:'ReadCommitted'});
}

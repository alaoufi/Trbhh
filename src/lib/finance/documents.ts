import 'server-only';
import type { CommerceDb } from '@/lib/commerce/types';
import type { FinanceInvoice, FinanceOrder, ArchivedFiscalSnapshot as FiscalSnapshot } from './types';
import { financeJson, financeNumber } from './read-model';
import { financeSchemaAvailable } from './schema';
import { parseFinanceId } from './service';

/** Ownership is enforced in SQL, before deserializing a customer's document. */
export async function readFinanceInvoice(db:Pick<CommerceDb,'$queryRaw'>,id:string,memberId?:number):Promise<FinanceInvoice|null>{
  const invoiceId=parseFinanceId(id);
  if(!await financeSchemaAvailable(db))return null;
  type Row={id:bigint;order_id:bigint;receipt_id:bigint;number:string|null;kind:FinanceInvoice['kind'];parent_id:bigint|null;status:FinanceInvoice['status'];created_at:Date;issued_at:Date|null;total_minor:bigint;net_minor:bigint|null;vat_minor:bigint|null;snapshot:unknown;source_snapshot:unknown;reason:string};
  const rows=memberId===undefined
    ?await db.$queryRaw<Row[]>`SELECT i.* FROM finance_invoices i WHERE i.id=${invoiceId}`
    :await db.$queryRaw<Row[]>`SELECT i.* FROM finance_invoices i INNER JOIN commerce_orders o ON o.id=i.order_id WHERE i.id=${invoiceId} AND o.member_id=${BigInt(memberId)}`;
  const row=rows[0];if(!row)return null;
  const result:FinanceInvoice={id:String(row.id),orderId:String(row.order_id),receiptId:String(row.receipt_id),number:row.number,kind:row.kind,parentId:row.parent_id?String(row.parent_id):null,status:row.status,at:row.created_at.toISOString(),issuedAt:row.issued_at?.toISOString()??null,totalMinor:financeNumber(row.total_minor),netMinor:row.net_minor===null?null:financeNumber(row.net_minor),vatMinor:row.vat_minor===null?null:financeNumber(row.vat_minor),snapshot:row.snapshot?financeJson<FiscalSnapshot>(row.snapshot):null,source:financeJson<FinanceOrder>(row.source_snapshot),reason:row.reason};
  return memberId===undefined?result:customerInvoice(result);
}
/** Strip internal allocation data before crossing any member rendering boundary. */
export function customerInvoice(invoice:FinanceInvoice):FinanceInvoice{
  const snapshot=invoice.snapshot;
  const stripSupplier=<T extends {supplierId?:string;supplierMinor?:number}>({supplierId:_supplierId,supplierMinor:_supplierMinor,...line}:T)=>line;
  const publicSnapshot:FinanceInvoice['snapshot']=!snapshot?null:snapshot.version===1
    ?{...snapshot,sourceReceiptId:'',policyReference:'',lines:snapshot.lines.map(stripSupplier)}
    :{...snapshot,sourceReceiptId:'',policyReference:'',policyId:'',policyRequestId:'',orderSnapshotFingerprint:'',lines:snapshot.lines.map(stripSupplier)};
  return {...invoice,receiptId:'',reason:invoice.status==='pending_policy'?'بانتظار اعتماد بيانات الإصدار.':invoice.kind==='invoice'?'':invoice.reason,
    source:{...invoice.source,memberId:'',suppliers:[]},
    snapshot:publicSnapshot};
}

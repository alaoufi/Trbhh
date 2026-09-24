import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import type {FinanceTaxPolicy,FiscalCalculationPolicy} from './types';
import {validateCalculationPolicy,validateFiscalTaxPolicy} from './fiscal-v2';
import {financeJson,financeNumber} from './read-model';
import {fingerprint} from './service';

export type ApprovedFiscalPolicy = FinanceTaxPolicy & {calculationPolicy:FiscalCalculationPolicy};
/** Latest policy at the supplied event time, including incomplete policies: never fall back to an older approval. */
export async function readApprovedFiscalPolicy(db:Pick<CommerceDb,'$queryRaw'>,at:Date,options:{historicalSnapshot?:boolean}={}):Promise<ApprovedFiscalPolicy> {
 if(!Number.isFinite(at.getTime()))throw new Error('finance_date_invalid');
 const saleDate=new Date(at.getTime()+10800000).toISOString().slice(0,10);
 const [row]=await db.$queryRaw<{id:bigint;request_id:bigint;effective_from:Date|string;issuer:unknown;vat_bps:number;policy_reference:string;created_at:Date;calculation_policy:unknown;approved_payload:unknown}[]>`
  SELECT p.*,r.payload AS approved_payload FROM finance_tax_policies p
  JOIN finance_change_requests r ON r.id=p.request_id
  WHERE r.kind='tax_settings' AND r.target_id='tax' AND r.status='approved'
    AND p.effective_from<=${saleDate} AND p.created_at<=${at} AND r.decided_at<=${at}
  ORDER BY p.effective_from DESC,p.id DESC LIMIT 1`;
 if(!row)throw new Error('finance_issuance_not_approved');
 const calculationPolicy=validateCalculationPolicy(financeJson(row.calculation_policy));
 const issuer=financeJson<FinanceTaxPolicy['issuer']>(row.issuer),vatBps=financeNumber(row.vat_bps);
 const effectiveFrom=row.effective_from instanceof Date?row.effective_from.toISOString().slice(0,10):String(row.effective_from).slice(0,10);
 const fields={effectiveFrom,issuer,vatBps,policyReference:row.policy_reference,calculationPolicy};
 const approved=financeJson<FinanceTaxPolicy>(row.approved_payload);
 if(!issuer?.name?.trim()||!issuer.address?.trim()||!Number.isSafeInteger(vatBps)||vatBps<0||vatBps>10000||!row.policy_reference||fingerprint(fields)!==fingerprint({effectiveFrom:approved.effectiveFrom,issuer:approved.issuer,vatBps:approved.vatBps,policyReference:approved.policyReference,calculationPolicy:approved.calculationPolicy}))throw new Error('finance_issuance_not_approved');
 validateFiscalTaxPolicy(fields,options.historicalSnapshot===true);
 return {...fields,id:String(row.id),requestId:String(row.request_id),at:row.created_at.toISOString()};
}

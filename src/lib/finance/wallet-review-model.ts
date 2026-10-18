import {createHash} from 'node:crypto';
import type {TaxRegistrationGap,TaxSupplyEvent} from './tax-registration';
import type {WalletTaxReview} from './tax-registration-read';
export type WalletReviewSource={id:string;userId:string;amountMinor:number;reason:string;sourceReference:string;at:string;moneyRef?:string|null;note?:string|null};
export type WalletReviewDecision={version:1;sourceId:string;sourceFingerprint:string;expectedLatestDecisionId:string|null;requestKey:string;status:'approved'|'needs_document';classification?:TaxSupplyEvent['classification'];netMinor?:number;sourceReference:string;documentaryReference?:string;documentLineIdentity?:string;evidenceKind?:'service_invoice'|'service_contract';note:string};
export type WalletReviewAudit={id:string;action:string;entity:string;entityId:string;payload:unknown;at?:string;actorId?:string};
export type WalletReviewQueueRow=WalletReviewSource&{sourceFingerprint:string;latestDecisionId:string|null;status:'open'|'approved'|'needs_document'|'stale'|'invalid';missingEvidence:string[];decisions:{id:string;decision:WalletReviewDecision;at?:string;actorId?:string}[]};
export const WALLET_REVIEW_ACTION='wallet_review_decision',WALLET_REVIEW_ENTITY='wallet_txn_review';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function walletSourceFingerprint(s:WalletReviewSource){return hash([s.id,s.userId,s.amountMinor,s.reason,s.sourceReference,s.at,s.moneyRef===undefined?s.sourceReference:s.moneyRef,s.note??null]);}
export function walletDecisionIdentity(v:unknown){const d=v as WalletReviewDecision;if(!d||typeof d!=='object')return null;return [d.version,d.sourceId,d.sourceFingerprint,d.expectedLatestDecisionId,d.requestKey,d.status,d.classification??null,d.netMinor??null,d.sourceReference,d.documentaryReference??null,d.documentLineIdentity??null,d.evidenceKind??null,d.note];}
const excludedReasons=new Set(['topup','admin_credit','bonus','verify_gift','points_convert','referral','welcome']);
export const walletReviewEligible=(s:WalletReviewSource)=>Number.isSafeInteger(s.amountMinor)&&s.amountMinor!==0&&!excludedReasons.has(s.reason)&&(s.amountMinor<0||s.reason==='refund');
const proofKey=(d:WalletReviewDecision)=>JSON.stringify([String(d.documentaryReference||'').trim().toLowerCase(),String(d.documentLineIdentity||'').trim().toLowerCase()]);
const fundingReference=(v:string)=>/(?:^|[\/:])(?:topup[_:-]|wallet[_:-]?topup)|uploads[\\/]topup_/i.test(v);
const validText=(v:unknown,max=191):v is string=>typeof v==='string'&&v.length<=max&&v.trim()===v&&v.length>0&&!/[\u0000-\u001f]/.test(v);
export function walletDecisionProblems(s:WalletReviewSource,d:WalletReviewDecision):string[]{
 const errors:string[]=[];
 if(!validText(s.id)||!validText(s.userId)||!Number.isSafeInteger(s.amountMinor)||s.amountMinor===0||!Number.isFinite(Date.parse(s.at)))errors.push('source_invalid');
 if(d.version!==1||d.sourceId!==s.id||!validText(d.requestKey,80)||!validText(d.note,1000)||!['approved','needs_document'].includes(d.status)||!(d.expectedLatestDecisionId===null||validText(d.expectedLatestDecisionId)))errors.push('decision_invalid');
 if(d.sourceFingerprint!==walletSourceFingerprint(s))errors.push('source_changed');
 if(d.status==='approved'){
  if(!validText(d.sourceReference)||!!s.sourceReference&&d.sourceReference!==s.sourceReference)errors.push('source_reference_required');
  if(!validText(d.documentaryReference))errors.push('documentary_reference_required');
  if([d.sourceReference,d.documentaryReference,d.documentLineIdentity].some(v=>typeof v==='string'&&fundingReference(v)))errors.push('funding_receipt_not_service_document');
  if(!validText(d.documentLineIdentity))errors.push('document_line_identity_required');
  if(!['service_invoice','service_contract'].includes(d.evidenceKind||''))errors.push('service_document_required');
  if(!['standard','zero','exempt','out_of_scope','capital_asset'].includes(d.classification||''))errors.push('classification_required');
  if(!Number.isSafeInteger(d.netMinor)||d.netMinor!<=0||d.netMinor!>Math.abs(s.amountMinor))errors.push('net_amount_invalid');
  if(s.amountMinor>0||s.reason==='refund')errors.push('refund_original_review_required');
 }
 return errors;
}
/** All supplied rows and relevant audits must be complete. No guessed classifications or refund offsets. */
export function reconcileWalletReviews(sources:WalletReviewSource[],audits:WalletReviewAudit[],invoiceSourceKeys:readonly string[]=[]){
 const relevant=audits.filter(a=>a.action===WALLET_REVIEW_ACTION&&a.entity===WALLET_REVIEW_ENTITY),proofs=new Map<string,Set<string>>(),conflictingIds=new Set<string>(),ids=new Map<string,string>();
 for(const a of relevant){const signature=hash([a.entityId,a.payload]),prior=ids.get(a.id);if(prior&&prior!==signature)conflictingIds.add(a.id);ids.set(a.id,signature);}
 const sourceIds=new Set<string>(),duplicateSources=new Set<string>();for(const s of sources){if(sourceIds.has(s.id))duplicateSources.add(s.id);sourceIds.add(s.id);}
 const auditedIds=new Set(relevant.map(a=>a.entityId)),integrityGaps:TaxRegistrationGap[]=[];
 for(const id of auditedIds)if(!sourceIds.has(id))integrityGaps.push({code:'wallet_review_source_missing',label:'مصدر حركة محفظة موثقة بالمراجعة غير موجود؛ يلزم التحقق من سلامة السجل.',count:1,amountMinor:null});
 const rows:WalletReviewQueueRow[]=[],events:TaxSupplyEvent[]=[],groups=new Map<string,WalletTaxReview>();
 for(const s of sources){
  if(rows.some(r=>r.id===s.id))continue;const eligible=walletReviewEligible(s);if(!eligible&&!auditedIds.has(s.id))continue;if(!eligible)integrityGaps.push({code:'wallet_review_source_ineligible',label:'حركة محفظة سبق توثيق مراجعتها تغيرت إلى مصدر غير مؤهل؛ يلزم فحص سلامة السجل.',count:1,amountMinor:Number.isSafeInteger(s.amountMinor)?Math.abs(s.amountMinor):null});
  const openProblems=['documentary_review_required',...(!s.sourceReference?['source_reference_required']:[]),...(s.reason==='refund'||s.amountMinor>0?['refund_original_review_required']:[])];
  const row:WalletReviewQueueRow={...s,sourceFingerprint:walletSourceFingerprint(s),latestDecisionId:null,status:'open',missingEvidence:openProblems,decisions:[]};
  const history=relevant.filter(a=>a.entityId===s.id).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0),seen=new Set<string>();let invalid=duplicateSources.has(s.id)||!eligible;
  for(const a of history){if(seen.has(a.id))continue;seen.add(a.id);const d=a.payload as WalletReviewDecision;const problems=d&&typeof d==='object'?walletDecisionProblems(s,d):['decision_invalid'];const stale=problems.includes('source_changed');if(problems.some(p=>p!=='source_changed'&&(!stale||!['source_reference_required','net_amount_invalid','refund_original_review_required'].includes(p))))invalid=true;if(stale&&d.status==='approved'&&(!validText(d.sourceReference)||!Number.isSafeInteger(d.netMinor)||d.netMinor!<=0))invalid=true;const after=(d as unknown as {after?:unknown})?.after;if(after!==undefined&&hash(walletDecisionIdentity(after))!==hash(walletDecisionIdentity(d)))invalid=true;if(conflictingIds.has(a.id)||d?.sourceId!==a.entityId||d?.expectedLatestDecisionId!==row.latestDecisionId)invalid=true;row.latestDecisionId=a.id;if(d&&typeof d==='object')row.decisions.push({id:a.id,decision:d,at:a.at,actorId:a.actorId});row.status=problems.includes('source_changed')?'stale':problems.length?'invalid':d.status;row.missingEvidence=problems.length?problems:d.status==='needs_document'?openProblems:[];}
  const latest=row.decisions.at(-1)?.decision;
  if(!!latest?.sourceReference&&invoiceSourceKeys.includes(latest.sourceReference)||!!latest?.documentaryReference&&invoiceSourceKeys.some(k=>k.toLowerCase()===latest.documentaryReference!.toLowerCase())||invoiceSourceKeys.includes(s.sourceReference)||invoiceSourceKeys.includes('wallet:'+s.id)||!!latest?.documentLineIdentity&&invoiceSourceKeys.some(k=>k.toLowerCase()===latest.documentLineIdentity!.toLowerCase())){invalid=true;row.missingEvidence.push('invoice_overlap');}
  if(invalid){row.status='invalid';if(!row.missingEvidence.length)row.missingEvidence.push('audit_chain_invalid');}
  rows.push(row);
 }
 // Valid explicit reopening releases its proof; corrupt/unknown histories retain
 // reservations so they cannot launder a reused documentary line.
 for(const a of relevant){const row=rows.find(r=>r.id===a.entityId),d=a.payload as WalletReviewDecision;if(row&&row.status!=='invalid'&&a.id!==row.latestDecisionId)continue;if(d?.version===1&&d.status==='approved'&&typeof d.documentLineIdentity==='string'&&typeof d.documentaryReference==='string'){const key=proofKey(d),set=proofs.get(key)||new Set<string>();set.add(a.entityId);proofs.set(key,set);}}
 for(const row of rows){const s=row,latest=row.decisions.at(-1)?.decision;
  if(latest?.status==='approved'&&validText(latest.documentLineIdentity)&&((proofs.get(proofKey(latest))?.size||0)>1)){row.status='invalid';row.missingEvidence.push('document_line_already_used');}
  if(row.status==='approved'&&latest)events.push({sourceKey:'wallet:'+s.id,origin:'payment',kind:'supply',classification:latest.classification!,netMinor:latest.netMinor!,at:s.at});
  else {const g=groups.get(s.reason)||{reason:s.reason,count:0,debitsMinor:0,creditsMinor:0};g.count++;if(s.amountMinor<0)g.debitsMinor+=-s.amountMinor;else g.creditsMinor+=s.amountMinor;if(!Number.isSafeInteger(g.debitsMinor)||!Number.isSafeInteger(g.creditsMinor))throw Error('wallet_review_amount_invalid');groups.set(s.reason,g);}

 }
 return {rows,unresolved:[...groups.values()],events,integrityGaps};
}

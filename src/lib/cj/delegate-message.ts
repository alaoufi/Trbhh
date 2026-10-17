import type {SupplierProductReference} from './product-reference';
export type DelegateIssue={problem:string;requested:string;orderId?:string|null;operationId?:string|null;supplierOrderId?:string|null;paymentId?:string|null;batchId?:string|null;trackingNumber?:string|null;productId?:string|null;sourceProductId?:string|null;amountMinor?:number;currency?:'SAR'|'USD';products?:SupplierProductReference[]};
/** Share operational references only. Never pass shipping/customer/auth records. */
export function safeIssueText(value:string):string {
 return value.slice(0,2000).replace(/["']?(?:CJ-Access-Token|authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)["']?\s*[=:]\s*["']?(?:Bearer\s+)?[^\s,;}"']+["']?/gi,'[Credentials redacted]')
  .replace(/Bearer\s+\S+/gi,'[Credentials redacted]')
  .replace(/https?:\/\/\S+/gi,'[URL redacted]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[Email redacted]')
  .replace(/(?:\+|00)\d[\d ()-]{7,}\d/g,'[Phone redacted]')
  .replace(/\b(?:05\d{8}|9665\d{8})\b/g,'[Phone redacted]')
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim();
}
const reference=(v?:string|null)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v)?v:null;
export function delegateMessage(issue:DelegateIssue):string {
 const lines=['Hello,','Please review the following Trbhh support issue:'];
 for(const [label,value] of [['Trbhh order ID',issue.orderId],['Operation reference',issue.operationId],['Supplier order reference',issue.supplierOrderId],['Batch ID',issue.batchId],['Payment ID',issue.paymentId],['Tracking number',issue.trackingNumber]]){
  const id=reference(value);if(id)lines.push(`${label}: ${id}`);
 }
 const seen=new Set<string>();
 if(reference(issue.productId))lines.push(`Product ID: ${issue.productId}`);
 if(reference(issue.sourceProductId))lines.push(`Source product ID: ${issue.sourceProductId}`);
 if(Number.isSafeInteger(issue.amountMinor)&&issue.amountMinor!>=0&&['SAR','USD'].includes(issue.currency||''))lines.push(`Recorded amount for review: ${(issue.amountMinor!/100).toFixed(2)} ${issue.currency} (not payment confirmation)`);
 for(const p of (issue.products||[]).slice(0,20)){
  const id=reference(p.storefrontProductId),pid=reference(p.pid),vid=reference(p.vid);
  if(!vid||!Number.isSafeInteger(p.quantity)||p.quantity<1)continue;
  const key=[id,pid,vid,p.quantity].join(':');if(seen.has(key))continue;seen.add(key);
  lines.push([id?`Product ID: ${id}`:'Product ID not recorded',pid?`Source product ID: ${pid}`:'',`Variant ID: ${vid}`,`Quantity: ${p.quantity}`].filter(Boolean).join(' · '));
 }
 lines.push(`Issue: ${safeIssueText(issue.problem)}`,`Requested action: ${safeIssueText(issue.requested)}`,'Please reconcile the references and report the outcome before retrying order creation or payment. This message does not authorize any charge or purchase.');
 return lines.join('\n');
}
export function delegateWhatsappUrl(message:string):string{return 'https://wa.me/?text='+encodeURIComponent(message);}

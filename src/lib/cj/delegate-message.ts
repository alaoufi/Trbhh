import type {SupplierProductReference} from './product-reference';
export type DelegateIssue={problem:string;requested:string;orderId?:string|null;operationId?:string|null;supplierOrderId?:string|null;paymentId?:string|null;batchId?:string|null;trackingNumber?:string|null;productId?:string|null;sourceProductId?:string|null;amountMinor?:number;currency?:'SAR'|'USD';products?:SupplierProductReference[]};
/** Share operational references only. Never pass shipping/customer/auth records. */
export function safeIssueText(value:string):string {
 return value.slice(0,2000).replace(/["']?(?:CJ-Access-Token|authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)["']?\s*[=:]\s*["']?(?:Bearer\s+)?[^\s,;}"']+["']?/gi,'[بيانات اتصال محجوبة]')
  .replace(/Bearer\s+\S+/gi,'[بيانات اتصال محجوبة]')
  .replace(/https?:\/\/\S+/gi,'[رابط محجوب]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[بريد محجوب]')
  .replace(/(?:\+|00)\d[\d ()-]{7,}\d/g,'[هاتف محجوب]')
  .replace(/\b(?:05\d{8}|9665\d{8})\b/g,'[هاتف محجوب]')
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim();
}
const reference=(v?:string|null)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v)?v:null;
export function delegateMessage(issue:DelegateIssue):string {
 const lines=['السلام عليكم،','نرجو مراجعة المشكلة التالية في تربح:'];
 for(const [label,value] of [['رقم طلب تربح',issue.orderId],['رقم العملية',issue.operationId],['الطلب الخارجي',issue.supplierOrderId],['رقم الدفعة',issue.batchId],['معرّف الدفع',issue.paymentId],['رقم التتبع',issue.trackingNumber]]){
  const id=reference(value);if(id)lines.push(`${label}: ${id}`);
 }
 const seen=new Set<string>();
 if(reference(issue.productId))lines.push(`رقم المنتج: ${issue.productId}`);
 if(reference(issue.sourceProductId))lines.push(`معرّف المصدر: ${issue.sourceProductId}`);
 if(Number.isSafeInteger(issue.amountMinor)&&issue.amountMinor!>=0&&['SAR','USD'].includes(issue.currency||''))lines.push(`المبلغ المسجل للمراجعة: ${(issue.amountMinor!/100).toFixed(2)} ${issue.currency} (ليس تأكيد سداد)`);
 for(const p of (issue.products||[]).slice(0,20)){
  const id=reference(p.storefrontProductId),pid=reference(p.pid),vid=reference(p.vid);
  if(!vid||!Number.isSafeInteger(p.quantity)||p.quantity<1)continue;
  const key=[id,pid,vid,p.quantity].join(':');if(seen.has(key))continue;seen.add(key);
  lines.push([id?`رقم المنتج: ${id}`:'رقم المنتج غير محفوظ',pid?`معرّف المصدر: ${pid}`:'',`معرّف الخيار: ${vid}`,`الكمية: ${p.quantity}`].filter(Boolean).join(' · '));
 }
 lines.push(`المشكلة: ${safeIssueText(issue.problem)}`,`المطلوب: ${safeIssueText(issue.requested)}`,'يرجى مطابقة المراجع وإفادة الإدارة بالنتيجة قبل إعادة أي إنشاء أو سداد. هذه الرسالة لا تفوض خصمًا أو شراءً.');
 return lines.join('\n');
}
export function delegateWhatsappUrl(message:string):string{return 'https://wa.me/?text='+encodeURIComponent(message);}

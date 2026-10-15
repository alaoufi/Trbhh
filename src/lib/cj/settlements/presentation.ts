/** Read-only display extraction. A newer quote never silently changes the settlement. */
export function unifiedSettlementPaymentUrl(id:string,total:number,rows:{status:string;fulfillment_status:string;last_error:string|null;pay_id:string|null;pay_expires_at:Date|null;total_usd_minor:number;evidence_json:unknown;wallet_authorized:bigint}[]):string|null{
 try{
  if(!rows.length||rows.reduce((n,r)=>n+r.total_usd_minor,0)!==total)return null;
  const metas=rows.map(r=>typeof r.evidence_json==='string'?JSON.parse(r.evidence_json):r.evidence_json);
  if(metas.some(m=>m?.exception?.actionRequired))return null;
  const payments=metas.map(m=>m?.payment);
  const first=payments[0];if(!first||!/^[A-Za-z0-9_-]{1,100}$/.test(first.payId)||first.batchId!==id||first.batchPayableUsdMinor!==total||first.expiresAt<=Date.now())return null;
  if(!rows.every((r,i)=>r.status==='pending'&&r.fulfillment_status==='payment_ready'&&!r.last_error&&!Number(r.wallet_authorized)&&r.pay_id===first.payId&&r.pay_expires_at?.getTime()===first.expiresAt&&payments[i]?.batchId===id&&payments[i].payId===first.payId&&payments[i].shipmentOrderId===first.shipmentOrderId&&payments[i].batchPayableUsdMinor===total&&payments[i].payableUsdMinor===r.total_usd_minor))return null;
  return `https://www.cjdropshipping.com/mine/payment?pid=${encodeURIComponent(first.payId)}`;
 }catch{return null;}
}
export function cjSettlementFreshnessAmount(evidence:unknown):number|null {
  try {
    const data = (typeof evidence==='string'?JSON.parse(evidence):evidence) as {freshness?:{actualUsdMinor?:unknown};proof?:{freshness?:{actualUsdMinor?:unknown}}}|null;
    const actual = data?.freshness?.actualUsdMinor??data?.proof?.freshness?.actualUsdMinor;
    return typeof actual==='number'&&Number.isSafeInteger(actual)&&actual>=0?actual:null;
  } catch { return null; }
}
export function cjPayableSelectable(row:{status:string;cjOrderId:string|null;lastError:string|null;payExpiresAt:Date|null;totalUsdMinor:number;actualUsdMinor:number|null},now=Date.now()):boolean {
  if(!['created','payment_ready'].includes(row.status)||!row.cjOrderId||row.lastError||(row.actualUsdMinor!==null&&row.actualUsdMinor!==row.totalUsdMinor))return false;
  return row.status==='created'||!!row.payExpiresAt&&row.payExpiresAt.getTime()>now;
}
export function cjPayableHoldReason(status:string,lastError:string|null):string {
  if(lastError){
    if(/price|amount|cost|payable|quote.*mismatch/.test(lastError))return 'تغيّرت التكلفة أو لا تطابق المبلغ المعتمد؛ راجع الفرق قبل السداد.';
    if(/stock|inventory/.test(lastError))return 'المخزون الحالي غير كافٍ أو لم يمكن تأكيده؛ السداد محجوب.';
    if(/freight|shipping|logistic/.test(lastError))return 'تغيّرت تكلفة الشحن أو لم تتأكد صلاحية المسار للسعودية؛ راجع الشحن قبل السداد.';
    if(/expired|expiry/.test(lastError))return 'انتهت صلاحية بيانات الدفع؛ يلزم التحقق مجددًا قبل السداد.';
    if(/uncertain|timeout/.test(lastError))return 'نتيجة العملية السابقة غير مؤكدة؛ طابق الطلب مع CJ ولا تكرر الإنشاء أو الدفع.';
    return 'أوقف التحقق معالجة هذا الطلب؛ راجع تفاصيله ونتيجة CJ قبل أي سداد.';
  }
  const reasons:Record<string,string>={pending:'تحصيل العميل مؤكد؛ طلب CJ لم يُجهّز بعد.',creating:'إعداد طلب CJ جارٍ؛ لا تكرر الإنشاء.',create_uncertain:'نتيجة إنشاء CJ غير مؤكدة؛ يلزم المطابقة دون إعادة الإنشاء.',parent_claimed:'إعداد رابط دفع CJ جارٍ؛ لا تكرر العملية.',parent_uncertain:'نتيجة إعداد السداد غير مؤكدة؛ يلزم التحقق من CJ أولاً.',blocked:'المعالجة متوقفة؛ راجع سبب التوقف في تفاصيل الطلب.',debit_claimed:'تنفيذ إذن السداد جارٍ؛ لا تدفع مرة أخرى.',debit_uncertain:'نتيجة الخصم غير مؤكدة؛ ينتظر الطلب مطابقة CJ.'};
  return reasons[status]||'';
}

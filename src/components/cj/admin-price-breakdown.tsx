const sar=(minor:number)=>`${(minor/100).toFixed(2)} ر.س`;
/** Administrative breakdown of the same verified customer quote, never a supplier payment amount. */
export function CjAdminPriceBreakdown({supplierMinor,saleMinor,otherCostsMinor,shippingMinor}:{supplierMinor:number;saleMinor:number;otherCostsMinor:number;shippingMinor:number}){
 const values=[supplierMinor,saleMinor,otherCostsMinor,shippingMinor];
 const profit=saleMinor-supplierMinor-otherCostsMinor,total=saleMinor+shippingMinor;
 if(values.some(n=>!Number.isSafeInteger(n)||n<0)||profit<0||!Number.isSafeInteger(total))return <p role="status">تعذر تأكيد تفصيل السعر؛ أعد التحديث.</p>;
 return <dl className="col-span-2 grid grid-cols-2 gap-1" data-cj-admin-price-breakdown>
 <dt>قيمة السلعة في CJ</dt><dd className="text-end font-bold" dir="ltr">{sar(supplierMinor)}</dd>
 <dt>هامش ربح تربح</dt><dd className="text-end font-bold" dir="ltr">{sar(profit)}</dd>
 {otherCostsMinor>0&&<><dt>تكاليف إضافية</dt><dd className="text-end font-bold" dir="ltr">{sar(otherCostsMinor)}</dd></>}
 <dt>الشحن</dt><dd className="text-end font-bold" dir="ltr">{sar(shippingMinor)}</dd>
 <dt className="border-t border-emerald-200 pt-1 font-bold">الإجمالي للعميل</dt><dd className="border-t border-emerald-200 pt-1 text-end font-bold" dir="ltr">{sar(total)}</dd>
 </dl>;
}

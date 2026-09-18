// Mirrors production adPriceLabel without importing any server module.
export function publicPriceLabel(ad:{price:number;intent?:'offer'|'wanted';priceType?:string|null;rentPeriod?:string|null}):string {
 if(!Number.isFinite(ad.price)||ad.price<=0){
  if(ad.priceType==='som')return 'على السوم';
  if(ad.priceType==='negotiable')return 'السعر قابل للتفاوض';
  return ad.intent==='wanted'?'الميزانية غير محددة':'السعر غير محدد';
 }
 const amount=`${new Intl.NumberFormat('en-US').format(ad.price)} ر.س`;
 const period:Record<string,string>={'بالساعة':'ساعة','يومي':'يوم','أسبوعي':'أسبوع','شهري':'شهر','سنوي':'سنة'};
 return ad.priceType==='rent'?`${amount} / ${period[ad.rentPeriod||'']||ad.rentPeriod?.trim()||'تأجير'}`:amount;
}

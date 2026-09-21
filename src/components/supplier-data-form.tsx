import type {OnboardingValues} from '@/lib/suppliers/onboarding-fields';

type Status='open'|'draft'|'submitted'|'approved'|'revoked';
type Props={token:string;supplierName:string;status:Status;values:OnboardingValues;saved?:boolean;error?:string};
const input='mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#F0B429] focus:outline-none focus:ring-2 focus:ring-[#F0B429]/30';
const groups=[
 ['بيانات المنشأة والمتجر',[
  ['establishment_name','اسم المنشأة',true],['store_name','اسم المتجر',true],['store_url','رابط متجر سلة',true],['entity_type','نوع الكيان',false],['registration_number','السجل التجاري',true],['registration_expiry','تاريخ انتهاء السجل',false],['tax_number','الرقم الضريبي',false],['address','العنوان',false],['region','المنطقة',false],['city','المدينة',false],
 ]],
 ['بيانات المسؤول',[
  ['contact_name','اسم صاحب المتجر أو المفوض',true],['contact_role','الصفة',false],['identity_number','رقم الهوية أو الإقامة',false],['phone','الجوال',true],['email','البريد الإلكتروني',true],['authorized_name','اسم المفوض بالموافقة',false],
 ]],
 ['التشغيل والشحن',[
  ['preparation_time','مدة تجهيز الطلب',false],['delivery_time','مدة التوصيل',false],['shipping_companies','شركات الشحن',false],['coverage','تغطية مناطق السعودية',false],['excluded_regions','المناطق المستثناة',false],['stock_actual','هل مخزون سلة فعلي؟',false],['stock_updated','هل يتم تحديث المخزون؟',false],
 ]],
 ['السياسات والإقرارات',[
  ['returns_policy','سياسة الاستبدال والاسترجاع',false],['returns_period','مدة الاسترجاع',false],['damage_policy','معالجة التالف أو غير المطابق',false],['return_shipping','من يتحمل شحن المرتجع',false],['settlement_terms','دورية التسوية',false],['agreements','الإقرارات والموافقات',false],['submitted_date','تاريخ تعبئة النموذج',false],['notes','ملاحظات',false],
 ]],
 ['البيانات البنكية',[
  ['beneficiary_name','اسم المستفيد البنكي',false],['bank_name','اسم البنك',false],['iban','IBAN',false],['account_holder','اسم صاحب الحساب',false],
 ]],
] as const;
const longFields=new Set(['address','shipping_companies','excluded_regions','returns_policy','damage_policy','settlement_terms','agreements','notes']);
const yesNo=new Set(['stock_actual','stock_updated']);

export function SupplierDataForm({token,supplierName,status,values,saved=false,error}:Props){
 if(status==='submitted')return <main dir="rtl" className="mx-auto min-h-screen max-w-2xl bg-[#faf9f6] px-4 py-14 text-[#16294A]"><section className="rounded-3xl border border-emerald-200 bg-white p-7 shadow-sm"><h1 className="text-2xl font-black">تم إرسال البيانات للمراجعة</h1><p className="mt-3 leading-8">شكرًا لك. وصلت بيانات {supplierName} إلى إدارة تربح، ولا يمكن تعديلها حتى تعيدها الإدارة للتصحيح.</p></section></main>;
 return <main dir="rtl" className="min-h-screen bg-[#faf9f6] px-4 py-8 text-[#16294A]"><div className="mx-auto max-w-4xl"><header className="rounded-3xl bg-[#16294A] p-6 text-white shadow-lg"><p className="text-sm font-bold text-[#F0B429]">تربح · بيانات المورد</p><h1 className="mt-2 text-2xl font-black">تعبئة بيانات {supplierName}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">احفظ مسودة للعودة إليها من الرابط نفسه، ثم أرسل البيانات للمراجعة. هذا الرابط لا يمنح أي دخول إلى لوحة تربح أو صلاحيات إدارية.</p></header>
 {saved&&<p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900">تم حفظ المسودة.</p>}
 {error&&<p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error==='validation'?'راجع الحقول الأساسية وصيغ الجوال والبريد والسجل ورابط المتجر ثم أعد الإرسال.':'تعذر حفظ البيانات. افتح أحدث رابط أرسلته لك إدارة تربح.'}</p>}
 <form method="post" action="/api/suppliers/data-invite" className="mt-5 space-y-5"><input type="hidden" name="token" value={token}/>{groups.map(([title,fields])=><fieldset key={title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><legend className="px-2 text-lg font-black">{title}</legend><div className="grid gap-4 sm:grid-cols-2">{fields.map(([name,label,required])=><label key={name} className={`text-sm font-bold ${longFields.has(name)?'sm:col-span-2':''}`}>{label}{required&&<span className="text-red-600"> *</span>}{yesNo.has(name)?<select className={input} name={name} defaultValue={values[name]||''}><option value="">اختر</option><option value="نعم">نعم</option><option value="لا">لا</option></select>:longFields.has(name)?<textarea className={input} name={name} rows={3} maxLength={2000} defaultValue={values[name]||''}/>:<input className={input} name={name} required={required} maxLength={name==='store_url'?300:name==='email'?254:200} type={name==='email'?'email':name==='store_url'?'url':name.includes('date')||name.includes('expiry')?'date':'text'} defaultValue={values[name]||''}/>}</label>)}</div></fieldset>)}
 <div className="sticky bottom-3 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur"><button name="intent" value="draft" formNoValidate className="min-h-12 flex-1 rounded-xl border-2 border-[#16294A] px-5 font-black text-[#16294A]">حفظ كمسودة</button><button name="intent" value="submit" className="min-h-12 flex-1 rounded-xl bg-[#F0B429] px-5 font-black text-[#16294A]">إرسال للمراجعة</button></div></form></div></main>;
}

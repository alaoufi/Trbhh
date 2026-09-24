import {MapPin,Plus,Star,Trash2} from 'lucide-react';
import {listMemberAddresses} from '@/lib/commerce/address-book';
import {formatAddressLine} from '@/lib/commerce/addresses';
import {requireUser} from '@/lib/auth';
import {deleteAddressAction,saveAddressAction,setDefaultAddressAction} from './actions';

export const dynamic='force-dynamic';
export const metadata={title:'عناوين الشحن'};
const field='h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#ff6a1a] focus:ring-2 focus:ring-[#ff6a1a]/15';
const label='mb-1 block text-xs font-bold text-slate-700';
const messages:Record<string,string>={address_fullName_required:'أدخل الاسم الكامل.',address_phone_required:'أدخل رقم الجوال.',address_region_required:'اختر المنطقة.',address_city_required:'أدخل المدينة.',address_district_required:'أدخل الحي.',address_street_required:'أدخل اسم الشارع.',address_buildingNumber_required:'أدخل رقم المبنى.',address_postalCode_required:'أدخل الرمز البريدي.',address_country_invalid:'العنوان يجب أن يكون داخل السعودية.',address_phone_invalid:'رقم الجوال غير صحيح.',address_alternate_phone_invalid:'رقم الجوال البديل غير صحيح.',address_email_invalid:'البريد الإلكتروني غير صحيح.',address_field_invalid:'راجع الحقول؛ يوجد حقل فارغ أو أطول من المسموح.',address_not_found:'تعذر العثور على العنوان لهذا الحساب.',address_invalid:'تعذر التحقق من بيانات العنوان.'};

export default async function AddressesPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const session=await requireUser(),sp=await searchParams,addresses=await listMemberAddresses(BigInt(session.uid));
 const error=sp.error?messages[sp.error]||'تعذر حفظ بيانات العنوان. راجع الحقول وحاول مرة أخرى.':null;
 return <div className="mx-auto max-w-4xl space-y-6 pb-8">
  <header className="rounded-2xl bg-[#16294a] p-5 text-white sm:p-7"><div className="flex items-center gap-3"><MapPin className="h-6 w-6 text-[#ff9a45]"/><div><h1 className="text-xl font-extrabold sm:text-2xl">عناوين الشحن</h1><p className="mt-1 text-sm text-white/75">احفظ عناوينك واختر عنوانًا افتراضيًا للطلبات القادمة.</p></div></div></header>
  {sp.saved&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">تم حفظ العنوان.</p>}
  {sp.default&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">تم تحديث العنوان الافتراضي.</p>}
  {sp.deleted&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">تم حذف العنوان.</p>}
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
  <section className="space-y-3"><h2 className="text-lg font-extrabold text-[#16294a]">عناويني المحفوظة <span className="text-sm text-slate-500">({addresses.length})</span></h2>
   {addresses.length===0?<p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">لم تحفظ عنوانًا بعد. أضف عنوانك لتجهيز رحلة الطلب.</p>:<div className="grid gap-3 sm:grid-cols-2">{addresses.map(a=><article key={a.id.toString()} className={`rounded-2xl border bg-white p-4 shadow-sm ${a.isDefault?'border-[#ff9a45] ring-1 ring-[#ff9a45]/25':'border-slate-200'}`}>
     <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold text-[#16294a]">{a.label||'عنواني'}</h3><p className="mt-1 text-sm font-bold">{a.snapshot.fullName}</p><p dir="ltr" className="mt-1 text-right text-sm text-slate-600">{a.snapshot.phone}</p></div>{a.isDefault&&<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800"><Star className="h-3.5 w-3.5 fill-current"/> افتراضي</span>}</div>
     <p className="mt-3 text-sm leading-6 text-slate-600">{[a.snapshot.region,a.snapshot.city,formatAddressLine(a.snapshot),a.snapshot.postalCode].filter(Boolean).join('، ')}</p>
     <div className="mt-4 flex flex-wrap gap-2">{!a.isDefault&&<form action={setDefaultAddressAction}><input type="hidden" name="addressId" value={a.id.toString()}/><button className="rounded-lg bg-[#16294a] px-3 py-2 text-xs font-bold text-white">تعيين افتراضي</button></form>}<form action={deleteAddressAction}><input type="hidden" name="addressId" value={a.id.toString()}/><button className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"><Trash2 className="h-3.5 w-3.5"/> حذف</button></form></div>
    </article>)}</div>}
  </section>
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold text-[#16294a]"><Plus className="h-5 w-5 text-[#ff6a1a]"/>إضافة عنوان</h2><p className="mb-5 text-sm text-slate-500">الحقول بعلامة * مطلوبة لتجهيز الشحن.</p>
   <form action={saveAddressAction} className="grid gap-4 sm:grid-cols-2">
    <div><label className={label}>اسم العنوان</label><input name="label" maxLength={40} placeholder="المنزل، العمل" className={field}/></div>
    <div><label className={label}>الاسم الكامل *</label><input name="fullName" required maxLength={120} autoComplete="name" className={field}/></div>
    <div><label className={label}>رقم الجوال *</label><input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="05xxxxxxxx" className={field}/></div>
    <div><label className={label}>جوال بديل (اختياري)</label><input name="alternatePhone" type="tel" inputMode="tel" className={field}/></div>
    <div><label className={label}>البريد الإلكتروني (اختياري)</label><input name="email" type="email" autoComplete="email" maxLength={254} className={field}/></div>
    <div><label className={label}>الدولة</label><input value="المملكة العربية السعودية" readOnly className={`${field} bg-slate-50`}/><input type="hidden" name="country" value="SA"/></div>
    <div><label className={label}>المنطقة *</label><input name="region" required maxLength={100} autoComplete="address-level1" className={field}/></div>
    <div><label className={label}>المدينة *</label><input name="city" required maxLength={100} autoComplete="address-level2" className={field}/></div>
    <div><label className={label}>الحي *</label><input name="district" required maxLength={120} autoComplete="address-level3" className={field}/></div>
    <div><label className={label}>اسم الشارع *</label><input name="street" required maxLength={200} autoComplete="street-address" className={field}/></div>
    <div><label className={label}>رقم المبنى *</label><input name="buildingNumber" required maxLength={20} className={field}/></div>
    <div><label className={label}>الرقم الفرعي (اختياري)</label><input name="secondaryNumber" maxLength={20} className={field}/></div>
    <div><label className={label}>الرمز البريدي *</label><input name="postalCode" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" className={field}/></div>
    <div><label className={label}>العنوان الوطني المختصر (اختياري)</label><input name="shortAddress" maxLength={16} className={field}/></div>
    <div className="sm:col-span-2"><label className={label}>وصف إضافي للوصول (اختياري)</label><textarea name="deliveryNotes" rows={2} maxLength={500} className={`${field} h-auto py-3`}/></div>
    <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="isDefault" value="1" className="h-4 w-4 accent-[#16294a]"/>اجعل هذا العنوان افتراضيًا</label>
    <button className="rounded-xl bg-[#ff6a1a] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#ea5c10] sm:col-span-2 sm:justify-self-start">حفظ العنوان</button>
   </form>
  </section>
 </div>;
}

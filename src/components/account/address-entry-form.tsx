'use client';
import {useState} from 'react';
import {MapPin, LocateFixed, Link2} from 'lucide-react';
import {parseMapsUrl} from '@/lib/maps';

/**
 * حقول إدخال العنوان (تُوضع داخل <form action={saveAddressAction}>):
 * - قائمة منسدلة للمنطقة ثم المدينة (من بيانات تربح)، والحي والشارع يدوي.
 * - العنوان الوطني المختصر + رقم المبنى والرمز البريدي.
 * - تحديد الموقع من الخريطة: «موقعي الحالي» أو لصق رابط Google Maps (إحداثيات اختيارية).
 */
const field='h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#ff6a1a] focus:ring-2 focus:ring-[#ff6a1a]/15';
const label='mb-1 block text-xs font-bold text-slate-700';

export function AddressEntryForm({regions, areas}:{regions:{id:number;name:string}[]; areas:{name:string;regionId:number}[]}){
  const [regionId, setRegionId] = useState(0);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [mapLink, setMapLink] = useState('');
  const [mapMsg, setMapMsg] = useState('');
  const cities = regionId ? areas.filter(a => a.regionId === regionId) : [];
  const regionName = regions.find(r => r.id === regionId)?.name || '';

  function useMyLocation(){
    setMapMsg('');
    if(typeof navigator==='undefined'||!navigator.geolocation){setMapMsg('تحديد الموقع غير مدعوم في هذا المتصفح.');return;}
    navigator.geolocation.getCurrentPosition(
      pos=>{setLat(String(Math.round(pos.coords.latitude*1e6)/1e6));setLng(String(Math.round(pos.coords.longitude*1e6)/1e6));setMapMsg('تم تحديد موقعك الحالي ✓');},
      ()=>setMapMsg('تعذّر تحديد الموقع — تأكّد من السماح بالوصول للموقع.'),
      {enableHighAccuracy:true,timeout:10000},
    );
  }
  function applyLink(){
    const parsed=parseMapsUrl(mapLink);
    if(parsed){setLat(String(parsed.lat));setLng(String(parsed.lng));setMapMsg('تم أخذ الموقع من الرابط ✓');}
    else setMapMsg('الصق رابط موقع من Google Maps (يحتوي إحداثيات).');
  }

  return <>
    {/* ===== بيانات المستلِم ===== */}
    <div><label className={label}>اسم العنوان</label><input name="label" maxLength={40} placeholder="المنزل، العمل" className={field}/></div>
    <div><label className={label}>الاسم الكامل *</label><input name="fullName" required maxLength={120} autoComplete="name" className={field}/></div>
    <div><label className={label}>رقم الجوال *</label><input name="phone" required type="tel" inputMode="tel" maxLength={20} placeholder="05xxxxxxxx" autoComplete="tel" className={field}/></div>
    <div><label className={label}>جوال بديل (اختياري)</label><input name="alternatePhone" type="tel" inputMode="tel" maxLength={20} className={field}/></div>
    <input type="hidden" name="country" value="SA"/>
    <input type="hidden" name="email" value=""/>

    {/* ===== القائمة المنسدلة: المنطقة ثم المدينة ===== */}
    <div><label className={label}>المنطقة *</label>
      <select required value={regionId||''} onChange={e=>setRegionId(Number(e.target.value)||0)} className={field}>
        <option value="">اختر المنطقة</option>
        {regions.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <input type="hidden" name="region" value={regionName}/>
    </div>
    <div><label className={label}>المدينة / المحافظة *</label>
      <select name="city" required defaultValue="" disabled={!regionId} className={field}>
        <option value="">{regionId?'اختر المدينة':'اختر المنطقة أولاً'}</option>
        {cities.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
    </div>
    <div><label className={label}>الحي *</label><input name="district" required maxLength={120} autoComplete="address-level3" placeholder="اسم الحي" className={field}/></div>
    <div><label className={label}>اسم الشارع *</label><input name="street" required maxLength={200} autoComplete="street-address" placeholder="اسم الشارع" className={field}/></div>

    {/* ===== العنوان الوطني ===== */}
    <div><label className={label}>رقم المبنى *</label><input name="buildingNumber" required maxLength={20} inputMode="numeric" placeholder="4 أرقام" className={field}/></div>
    <div><label className={label}>الرقم الفرعي (اختياري)</label><input name="secondaryNumber" maxLength={20} inputMode="numeric" className={field}/></div>
    <div><label className={label}>الرمز البريدي *</label><input name="postalCode" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="5 أرقام" className={field}/></div>
    <div><label className={label}>العنوان الوطني المختصر (مطلوب لشحن CJ)</label><input name="shortAddress" maxLength={8} pattern="[A-Za-z]{4}[0-9]{4}" title="٤ أحرف ثم ٤ أرقام مثل QDMA9340" placeholder="مثال: QDMA9340" className={field} style={{textTransform:'uppercase'}}/><span className="mt-0.5 block text-[11px] text-slate-400">٤ أحرف ثم ٤ أرقام</span></div>

    {/* ===== تحديد الموقع من الخريطة (اختياري) ===== */}
    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700"><MapPin className="h-4 w-4 text-[#ff6a1a]"/>تحديد الموقع على الخريطة (اختياري — يسهّل الوصول)</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={useMyLocation} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#16294a] px-3 text-xs font-bold text-white"><LocateFixed className="h-4 w-4"/>موقعي الحالي</button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input value={mapLink} onChange={e=>setMapLink(e.target.value)} placeholder="أو الصق رابط Google Maps" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs" dir="ltr"/>
          <button type="button" onClick={applyLink} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-[#16294a]"><Link2 className="h-4 w-4"/>أخذ</button>
        </div>
      </div>
      {(lat&&lng)&&<p className="mt-2 text-[11px] font-bold text-emerald-700" dir="ltr">📍 {lat}, {lng}</p>}
      {mapMsg&&<p className="mt-1 text-[11px] font-bold text-slate-600">{mapMsg}</p>}
      <input type="hidden" name="lat" value={lat}/>
      <input type="hidden" name="lng" value={lng}/>
    </div>

    <div className="sm:col-span-2"><label className={label}>وصف إضافي للوصول (اختياري)</label><textarea name="deliveryNotes" rows={2} maxLength={500} placeholder="علامة مميزة قرب الموقع، تعليمات التسليم…" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"/></div>
    <label className="sm:col-span-2 flex cursor-pointer items-center gap-2 text-sm font-bold text-[#16294a]"><input type="checkbox" name="isDefault" value="1" className="h-4 w-4 accent-[#16294a]"/>اجعل هذا العنوان افتراضيًا</label>
  </>;
}

'use client';
import { useActionState, useState } from 'react';
import { HOME_HERO_LIMIT, parseHomeHeroIds } from '@/lib/home-hero-selection';
import { saveHomeHeroAction } from './actions';

type Option = { id: number; title: string };
export function HomeHeroPicker({ initial, options, readOnly }: { initial: Option[]; options: Option[]; readOnly: boolean }) {
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState('');
  const [idInput, setIdInput] = useState('');
  const [error, setError] = useState('');
  const [state, action, pending] = useActionState(saveHomeHeroAction, {});
  const [dirty, setDirty] = useState(false);
  function change(next: Option[]) { setSelected(next); setDirty(true); setError(''); }
  function add(option: Option) {
    if (selected.some(item => item.id === option.id)) return;
    if (selected.length >= HOME_HERO_LIMIT) { setError('الحد الأقصى عشرة إعلانات.'); return; }
    change([...selected, option]);
  }
  function move(index: number, offset: number) {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change(next);
  }
  const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-40';
  return <form action={form => { setDirty(false); action(form); }} className="space-y-4 rounded-xl border bg-card p-4">
    <input type="hidden" name="ids" value={selected.map(ad => ad.id).join(',')} />
    {readOnly && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">يمكن تجربة الاختيار والترتيب هنا؛ الحفظ معطل لحماية بيانات الموقع العام.</p>}
    <h2 className="font-bold">الإعلانات المختارة ({selected.length}/{HOME_HERO_LIMIT})</h2>
    {!selected.length && <p className="text-sm">لم تحدد الإدارة أي إعلان للبانر.</p>}
    <ol className="space-y-2">{selected.map((ad, index) => <li key={ad.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="min-w-0 flex-1 break-words">{index + 1}. {ad.title} — #{ad.id}</span>
      <button type="button" className={button} disabled={pending || index === 0} aria-label={`تقديم الإعلان ${ad.id}`} onClick={() => move(index, -1)}>أعلى</button>
      <button type="button" className={button} disabled={pending || index === selected.length - 1} aria-label={`تأخير الإعلان ${ad.id}`} onClick={() => move(index, 1)}>أسفل</button>
      <button type="button" className={button} disabled={pending} aria-label={`إزالة الإعلان ${ad.id}`} onClick={() => change(selected.filter(item => item.id !== ad.id))}>إزالة</button>
    </li>)}</ol>
    <label className="block space-y-1"><span>ابحث في أحدث 100 إعلان متاح</span><input value={query} onChange={e => setQuery(e.target.value)} className="h-11 w-full rounded-lg border px-3" /></label>
    <ul className="max-h-64 space-y-1 overflow-y-auto">{options.filter(ad => `${ad.id} ${ad.title}`.includes(query.trim())).map(ad => <li key={ad.id} className="flex items-center gap-2 border-b py-2">
      <span className="min-w-0 flex-1 break-words">{ad.title} — #{ad.id}</span>
      <button type="button" className={button} disabled={pending || selected.some(item => item.id === ad.id) || selected.length >= HOME_HERO_LIMIT} onClick={() => add(ad)}>اختيار</button>
    </li>)}</ul>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1"><span className="block text-sm">أو أضف رقم إعلان آخر من صفحة إدارة الإعلانات</span><input inputMode="numeric" value={idInput} onChange={e => setIdInput(e.target.value)} className="h-11 w-full rounded-lg border px-3" /></label>
      <button type="button" className={button} disabled={pending} onClick={() => {
        try { const ids = parseHomeHeroIds(idInput); if (ids.length !== 1) throw new Error(); add(options.find(ad => ad.id === ids[0]) || { id: ids[0], title: 'إعلان محدد بالرقم (يتم التحقق عند الحفظ)' }); setIdInput(''); }
        catch { setError('أدخل رقم إعلان صحيحًا واحدًا.'); }
      }}>إضافة للاختيارات</button>
    </div>
    {(error || (!dirty && state.error)) && <p role="alert" className="text-red-700">{error || state.error}</p>}
    {!dirty && state.saved && <p role="status" className="text-green-700">تم حفظ الإعلانات وترتيبها.</p>}
    <button disabled={readOnly || pending} className="rounded-lg bg-primary px-4 py-3 font-bold text-white disabled:opacity-50">{pending ? 'جارٍ الحفظ…' : 'حفظ إعلانات البانر'}</button>
  </form>;
}

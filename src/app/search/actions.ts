'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { saveSearch, deleteSavedSearch } from '@/lib/saved-search';
import { getCities, getAreas } from '@/lib/data';
import { parseSmartQuery, smartQueryToParams } from '@/lib/smart-search';

/** بحث ذكي بالكلام الطبيعي: يحلّل الجملة لفلاتر ثم يحوّل لصفحة النتائج. */
export async function smartSearchAction(formData: FormData) {
  const text = String(formData.get('smart') || '').trim();
  if (!text) redirect('/search');
  const [cities, areas] = await Promise.all([getCities(), getAreas()]);
  const sq = parseSmartQuery(
    text,
    cities.map((c) => ({ id: c.id, name: c.name })),
    areas.map((a) => ({ id: a.id, name: a.name, cityId: a.cityId })),
  );
  const qs = new URLSearchParams(smartQueryToParams(sq)).toString();
  redirect(`/search${qs ? `?${qs}` : ''}`);
}

/** حفظ البحث الحالي لتنبيه العضو عند نشر إعلان مطابق. */
export async function saveSearchAction(formData: FormData) {
  const session = await requireUser();
  const q = String(formData.get('q') || '').trim();
  const ok = await saveSearch(session.uid, q);
  redirect(`/search?q=${encodeURIComponent(q)}&saved=${ok ? '1' : 'full'}`);
}

export async function deleteSavedSearchAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id') || 0);
  if (id) await deleteSavedSearch(session.uid, id);
  const q = String(formData.get('q') || '');
  redirect(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
}

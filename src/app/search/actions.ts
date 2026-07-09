'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { saveSearch, deleteSavedSearch } from '@/lib/saved-search';

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

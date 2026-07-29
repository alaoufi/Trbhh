'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const COOKIE = 'trbhh_compare';
const MAX = 4;

export async function readCompareIds(): Promise<number[]> {
  const raw = (await cookies()).get(COOKIE)?.value || '';
  return raw.split(',').map((s) => Number(s)).filter((n) => n > 0).slice(0, MAX);
}

/** إضافة/إزالة إعلان من قائمة المقارنة (كوكي، حتى ٤ إعلانات). */
export async function toggleCompareAction(formData: FormData) {
  const adId = Number(formData.get('adId') || 0);
  const back = String(formData.get('back') || (adId ? `/ads/${adId}` : '/'));
  if (!adId) redirect(back);
  const ids = await readCompareIds();
  const next = ids.includes(adId) ? ids.filter((x) => x !== adId) : [...ids, adId].slice(-MAX);
  (await cookies()).set(COOKIE, next.join(','), { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
  revalidatePath(back);
  revalidatePath('/compare');
  redirect(back);
}

export async function clearCompareAction() {
  (await cookies()).set(COOKIE, '', { path: '/', maxAge: 0 });
  redirect('/compare');
}

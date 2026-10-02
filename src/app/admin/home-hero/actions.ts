'use server';
import { requireAction } from '@/lib/roles';
import { getHomeHeroAds } from '@/lib/data';
import { setSetting } from '@/lib/settings';
import { HOME_HERO_AD_IDS, parseHomeHeroIds } from '@/lib/home-hero-selection';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { revalidatePath } from 'next/cache';

export async function saveHomeHeroAction(_state: { error?: string; saved?: boolean }, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  await requireAction('users', 'edit');
  if (isReadOnlyPreview()) return { error: 'هذه معاينة للقراءة فقط؛ لم يتم تغيير بيانات الموقع.' };
  let ids: number[];
  try { ids = parseHomeHeroIds(String(form.get('ids') ?? '')); }
  catch { return { error: 'اختر حتى عشرة أرقام إعلانات صحيحة دون تكرار.' }; }
  try {
    const available = await getHomeHeroAds(ids);
    if (available.length !== ids.length) return { error: 'يوجد إعلان غير متاح للعامة. أزله من الاختيارات ثم احفظ.' };
    await setSetting(HOME_HERO_AD_IDS, ids.join(','));
    revalidatePath('/');
    revalidatePath('/admin/home-hero');
    return { saved: true };
  } catch { return { error: 'تعذر حفظ الاختيارات. حاول مجددًا.' }; }
}

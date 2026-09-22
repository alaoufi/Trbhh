'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAction } from '@/lib/roles';
import { setDefaultMarginBps } from '@/lib/cj/pricing';
import { saveCjSyncSettings, syncCjCatalog } from '@/lib/cj/sync';

/** حفظ الهامش الافتراضي (٪) — للمشرف فقط. لا شراء ولا اتصال بمورّد هنا. */
export async function saveCjMargin(form: FormData) {
  await requireAction('suppliers', 'edit');
  const pct = Number(String(form.get('marginPercent') || '').trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) redirect('/admin/suppliers/cj?error=margin');
  await setDefaultMarginBps(Math.round(pct * 100));
  revalidatePath('/admin/suppliers/cj');
  redirect('/admin/suppliers/cj?saved=margin');
}

const numField = (form: FormData, name: string): number | undefined => {
  const raw = String(form.get(name) ?? '').trim();
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** حفظ إعدادات مزامنة الكتالوج (تفعيل/حجم صفحة/عدد صفحات/صرف/شحن). */
export async function saveCjSync(form: FormData) {
  await requireAction('suppliers', 'edit');
  const rate = numField(form, 'usdToSar'); // يُدخَل بالريال (٣٫٧٥) ويُخزَّن ×١٠٠
  await saveCjSyncSettings({
    enabled: String(form.get('enabled') || '') === '1',
    pageSize: numField(form, 'pageSize'),
    maxPages: numField(form, 'maxPages'),
    usdToSarX100: rate !== undefined ? Math.round(rate * 100) : undefined,
    shippingMinor: (() => { const s = numField(form, 'shippingSar'); return s !== undefined ? Math.round(s * 100) : undefined; })(),
  });
  revalidatePath('/admin/suppliers/cj');
  redirect('/admin/suppliers/cj?saved=sync');
}

/** مزامنة الآن (يدوية) — تتجاوز مفتاح الجدولة. قراءة فقط، لا شراء. */
export async function runCjSync() {
  await requireAction('suppliers', 'edit');
  const r = await syncCjCatalog({ force: true });
  if (r.ok) redirect(`/admin/suppliers/cj?synced=1&imported=${r.imported}&pages=${r.pages}&skipped=${r.skipped}`);
  redirect(`/admin/suppliers/cj?syncerr=${encodeURIComponent(r.error)}`);
}

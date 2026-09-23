'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/access-control/guards';
import { setDefaultMarginBps } from '@/lib/cj/pricing';
import { saveCjSyncSettings, syncCjCatalog } from '@/lib/cj/sync';
import { importCjProductByPid } from '@/lib/cj/import';
import { removeCjProductById } from '@/lib/cj/mapping';

/** حفظ الهامش الافتراضي (٪) — للمشرف فقط. لا شراء ولا اتصال بمورّد هنا. */
export async function saveCjMargin(form: FormData) {
  await requireAccess('pricing', 'manage_settings');
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
  await requireAccess('integrations', 'manage_settings');
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
  await requireAccess('integrations', 'sync');
  const r = await syncCjCatalog({ force: true });
  if (r.ok) redirect(`/admin/suppliers/cj?synced=1&imported=${r.imported}&pages=${r.pages}&skipped=${r.skipped}`);
  redirect(`/admin/suppliers/cj?syncerr=${encodeURIComponent(r.error)}`);
}

/** استيراد منتج CJ مختار (بمعرّفه) إلى التخزين الوسيط مع تسعيره — لا يُعرض للعامة. */
export async function importCjProduct(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const pid = String(form.get('pid') || '').trim();
  const back = String(form.get('back') || '/admin/suppliers/cj/browse');
  const r = await importCjProductByPid(pid);
  const sep = back.includes('?') ? '&' : '?';
  if (r.ok) redirect(`${back}${sep}imported=${encodeURIComponent(r.pid)}`);
  redirect(`${back}${sep}imperr=${encodeURIComponent(r.error)}`);
}

/** حذف منتج مستورد من التخزين الوسيط (لا يمسّ أي منتج عام). */
export async function removeCjProduct(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const back = String(form.get('back') || '/admin/suppliers/cj/browse');
  await removeCjProductById(id);
  revalidatePath('/admin/suppliers/cj/browse');
  const sep = back.includes('?') ? '&' : '?';
  redirect(`${back}${sep}removed=1`);
}

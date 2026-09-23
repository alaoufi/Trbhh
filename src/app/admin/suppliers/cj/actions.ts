'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/access-control/guards';
import { setDefaultMarginBps } from '@/lib/cj/pricing';
import { saveCjSyncSettings, syncCjCatalog } from '@/lib/cj/sync';
import { importCjProductByPid } from '@/lib/cj/import';
import { removeCjProductById, setCjProductNameAr, setCjProductHidden, setCjProductPriceOverride, getCjProductById, listUntranslatedCjProducts, updateCjReview, setCjProductDescriptionAr, setCjProductCategory } from '@/lib/cj/mapping';
import { translateToArabic, translateManyCached, learnTranslation } from '@/lib/cj/translate';
import { getCategories } from '@/lib/cj/client';
import { createOrder, transitionOrder, setOrderTracking } from '@/lib/cj/orders/store';
import { warmCjTranslations, refreshCjMedia } from '@/lib/cj/translate-warm';
import { setCjStorefrontPublic } from '@/lib/cj/storefront';
import { upsertAgent, setDefaultAgentWeeklyQuota, setAgentActive, assignProductAgent, unassignProductAgent } from '@/lib/cj/agents';
import { prisma } from '@/lib/prisma';

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

const backOf = (form: FormData) => String(form.get('back') || '/admin/suppliers/cj/browse');
const withParam = (back: string, kv: string) => `${back}${back.includes('?') ? '&' : '?'}${kv}`;

/** حفظ العنوان العربي المعروض (تحرير يدوي) — لا يمسّ النص المصدر. */
export async function saveCjArabic(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const nameAr = String(form.get('nameAr') || '').trim();
  await setCjProductNameAr(id, nameAr);
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** تعديل سعر البيع النهائي بالريال (أو تركه فارغاً للعودة للسعر المحسوب). */
export async function saveCjPrice(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const raw = String(form.get('priceSar') || '').trim();
  if (raw === '') await setCjProductPriceOverride(id, null);
  else { const v = Number(raw); if (Number.isFinite(v) && v >= 0) await setCjProductPriceOverride(id, Math.round(v * 100)); }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** إخفاء/إظهار السلعة من المعاينة. */
export async function toggleCjHidden(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const hidden = String(form.get('hidden') || '') === '1';
  await setCjProductHidden(id, hidden);
  revalidatePath('/admin/suppliers/cj/browse');
  revalidatePath('/admin/suppliers/cj/showcase');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** ترجمة تلقائية لعنوان سلعة واحدة (إعادة ترجمة عند الطلب). */
export async function translateCjProduct(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const row = await getCjProductById(id);
  if (row) { const ar = await translateToArabic(row.name).catch(() => null); if (ar) await setCjProductNameAr(id, ar); }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** حفظ شاشة المراجعة الكاملة لسلعة مستوردة (عنوان/وصف/تصنيف/حالة/سعر/إخفاء). */
export async function saveCjReview(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  await updateCjReview(id, {
    nameAr: String(form.get('nameAr') || '').trim(),
    descriptionAr: String(form.get('descriptionAr') || '').trim(),
    trbhhCategory: String(form.get('trbhhCategory') || '').trim(),
    status: String(form.get('status') || 'draft'),
  });
  const rawPrice = String(form.get('priceSar') || '').trim();
  if (rawPrice === '') await setCjProductPriceOverride(id, null);
  else { const v = Number(rawPrice); if (Number.isFinite(v) && v >= 0) await setCjProductPriceOverride(id, Math.round(v * 100)); }
  await setCjProductHidden(id, String(form.get('hidden') || '') === '1');
  revalidatePath('/admin/suppliers/cj/browse');
  revalidatePath('/admin/suppliers/cj/showcase');
  redirect(`/admin/suppliers/cj/review/${id}?saved=1`);
}

/* ------------------------- طلبات CJ (بنية/اختبار — لا شراء حقيقي) ------------------------- */

/** إنشاء طلب اختبار داخلي لتجربة دورة الحالات (لا اتصال بـ CJ ولا دفع). */
export async function createTestCjOrder() {
  const s = await requireAccess('integrations', 'manage_settings');
  const ref = `TEST-${Date.now()}`;
  const { id } = await createOrder({ internalRef: ref, userId: s.uid, productName: 'طلب اختبار داخلي', currency: 'SAR' });
  redirect(`/admin/suppliers/cj/orders/${id}`);
}

/** تحريك حالة الطلب يدوياً (اختبار آلة الحالات) — يتحقق من صلاحية الانتقال server-side. */
export async function advanceCjOrder(form: FormData) {
  const s = await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const to = String(form.get('to') || '');
  const reason = String(form.get('reason') || '').trim();
  const r = await transitionOrder(id, to, { source: 'internal', actorId: s.uid, reason });
  const q = r.ok ? 'moved=1' : `err=${encodeURIComponent(r.error)}`;
  revalidatePath(`/admin/suppliers/cj/orders/${id}`);
  redirect(`/admin/suppliers/cj/orders/${id}?${q}`);
}

/** تحديث بيانات التتبّع يدوياً (اختبار) — شركة الشحن ورقم/رابط التتبّع. */
export async function setCjOrderTracking(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  await setOrderTracking(id, {
    carrier: String(form.get('carrier') || '').trim(),
    trackingNumber: String(form.get('trackingNumber') || '').trim(),
    trackingUrl: String(form.get('trackingUrl') || '').trim(),
  }, { source: 'internal' });
  revalidatePath(`/admin/suppliers/cj/orders/${id}`);
  redirect(`/admin/suppliers/cj/orders/${id}?tracked=1`);
}

/** ترجمة أسماء تصنيفات CJ إلى العربية وتخزينها (دفعة محدودة لكل ضغطة). */
export async function translateCjCategories(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const back = String(form.get('back') || '/admin/suppliers/cj/browse');
  const cats = await getCategories();
  let done = 0;
  if (cats.ok) { const map = await translateManyCached(cats.data.map((c) => c.name), 120); done = map.size; }
  redirect(withParam(back, `cattr=${done}`));
}

/* ------------------------- الوكلاء ------------------------- */

const AG = '/admin/suppliers/cj/agents';

/** حفظ الحصّة الأسبوعية الافتراضية للوكلاء. */
export async function saveAgentQuota(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const n = Number(String(form.get('weeklyQuota') || '').trim());
  if (Number.isFinite(n) && n >= 0) await setDefaultAgentWeeklyQuota(Math.floor(n));
  redirect(`${AG}?saved=quota`);
}

/** منح عضو دور وكيل (بحثاً بالبريد/الجوال/اسم الدخول) مع جواله وواتسه وحصّته. */
export async function saveAgent(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const ident = String(form.get('ident') || '').trim();
  if (!ident) redirect(`${AG}?err=no_ident`);
  const tail = ident.replace(/\D+/g, '').slice(-9);
  const user = await prisma.users.findFirst({
    where: { OR: [{ email: ident }, { userName: ident }, ...(tail ? [{ phoneNumber: { endsWith: tail } }] : [])] },
    select: { id: true, phoneNumber: true },
  }).catch(() => null);
  if (!user) redirect(`${AG}?err=not_found`);
  const phone = String(form.get('phone') || '').trim() || user!.phoneNumber || '';
  const whatsapp = String(form.get('whatsapp') || '').trim() || phone;
  const quotaRaw = String(form.get('weeklyQuota') || '').trim();
  await upsertAgent({
    userId: user!.id, phone, whatsapp,
    weeklyQuota: quotaRaw === '' ? undefined : Number(quotaRaw),
    active: true, notes: String(form.get('notes') || '').trim(),
  });
  redirect(`${AG}?saved=agent`);
}

/** تفعيل/إيقاف وكيل. */
export async function toggleAgent(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const uid = Number(String(form.get('userId') || ''));
  const active = String(form.get('active') || '') === '1';
  if (Number.isInteger(uid) && uid > 0) await setAgentActive(uid, active);
  redirect(`${AG}?saved=toggle`);
}

/** إسناد/فك سلعة لوكيل من الإدارة. */
export async function assignAgentToProduct(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const productId = Number(String(form.get('productId') || ''));
  const agentUserId = Number(String(form.get('agentUserId') || ''));
  const back = String(form.get('back') || '/admin/suppliers/cj/browse');
  if (Number.isInteger(productId) && productId > 0) {
    if (Number.isInteger(agentUserId) && agentUserId > 0) await assignProductAgent(productId, agentUserId);
    else await unassignProductAgent(productId);
  }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(back, 'edited=1'));
}

/** تعديل مباشر من صفحة السلعة (لمن يملك صلاحية) — يحدّث العرض ويُعلّم الترجمة. */
export async function saveCjStorefrontEdit(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const id = Number(String(form.get('id') || ''));
  const row = await getCjProductById(id);
  const nameAr = String(form.get('nameAr') || '').trim();
  const descAr = String(form.get('descriptionAr') || '').trim();
  const cat = String(form.get('trbhhCategory') || '').trim();
  const priceRaw = String(form.get('priceSar') || '').trim();
  if (nameAr) { await setCjProductNameAr(id, nameAr); if (row?.name) await learnTranslation(row.name, nameAr); }
  await setCjProductDescriptionAr(id, descAr);
  if (row?.source_description && descAr) await learnTranslation(row.source_description, descAr);
  await setCjProductCategory(id, cat);
  if (priceRaw === '') await setCjProductPriceOverride(id, null);
  else { const v = Number(priceRaw); if (Number.isFinite(v) && v >= 0) await setCjProductPriceOverride(id, Math.round(v * 100)); }
  revalidatePath(`/cj/${id}`);
  revalidatePath('/cj');
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(`/cj/${id}?edited=1`);
}

/** تفعيل/إيقاف إظهار متجر CJ للعامة (بعد نجاح التجربة). الشراء يبقى معطّلاً بمفتاحه. */
export async function setCjStorefront(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const on = String(form.get('value') || '') === '1';
  await setCjStorefrontPublic(on);
  revalidatePath('/admin/suppliers/cj/showcase');
  revalidatePath('/cj');
  redirect(`/admin/suppliers/cj/showcase?published=${on ? '1' : '0'}`);
}

/** تحديث كل الترجمات الآن (تصنيفات + حقول السلع المستوردة) وتخزينها على الخادم. */
export async function runCjTranslateWarm(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const back = String(form.get('back') || '/admin/suppliers/cj/browse');
  const r = await warmCjTranslations({ categoryMax: 150, productMax: 40 });
  redirect(withParam(back, `warmed=${r.categories}-${r.productNames}`));
}

/** إعادة جلب صور ومواصفات كل السلع المستوردة (يُصلح الصور المكسورة). */
export async function refreshCjMediaAction(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const back = String(form.get('back') || '/admin/suppliers/cj/browse');
  const r = await refreshCjMedia(30);
  redirect(withParam(back, `mediaref=${r.refreshed}`));
}

/** ترجمة تلقائية جماعية لكل سلعة بلا عنوان عربي بعد (دفعة محدودة). */
export async function translateAllCj(form: FormData) {
  await requireAccess('integrations', 'manage_settings');
  const rows = await listUntranslatedCjProducts(40);
  let done = 0;
  for (const r of rows) { const ar = await translateToArabic(r.name).catch(() => null); if (ar) { await setCjProductNameAr(r.id, ar); done++; } }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), `translated=${done}`));
}

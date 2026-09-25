'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { hasAccess, requireAccess } from '@/lib/access-control/guards';
import { defaultMarginBps, setDefaultMarginBps } from '@/lib/cj/pricing';
import { cjSyncSettings, saveCjSyncSettings, syncCjCatalog } from '@/lib/cj/sync';
import { importCjProductByPid } from '@/lib/cj/import';
import { removeCjProductById, setCjProductNameAr, setCjProductHidden, setCjProductPriceOverride, getCjProductById, listUntranslatedCjProducts, updateCjReview, setCjProductStatus, setCjProductDescriptionAr, setCjProductCategory, cjProductOrderCount, setCjProductAvailability, setCjProductGallery, setCjProductDetails, buildCjDetails } from '@/lib/cj/mapping';
import { translateToArabicCached, translateManyCached, learnTranslation, isArabicText } from '@/lib/cj/translate';
import { readCjAvailability } from '@/lib/cj/availability';
import { collectCjProductImages } from '@/lib/cj/media';
import { getSession } from '@/lib/auth';
import { cjProductCapabilities } from '@/lib/cj/access';
import { getCategories, getProduct, listProductsPage, getVariants as cjGetVariants } from '@/lib/cj/client';
import { createOrder, getOrderById, transitionOrder, setOrderTracking } from '@/lib/cj/orders/store';
import { warmCjTranslations, refreshCjMedia } from '@/lib/cj/translate-warm';
import { cjStorefrontPublic, setCjStorefrontPublic } from '@/lib/cj/storefront';
import { getAgent, defaultAgentWeeklyQuota, upsertAgent, setDefaultAgentWeeklyQuota, setAgentActive, assignProductAgent, unassignProductAgent } from '@/lib/cj/agents';
import { auditCjChange, cjProductAudit, cjAuditFingerprint } from '@/lib/cj/audit';
import { prisma } from '@/lib/prisma';

async function requireCjAccess(module: string, action: string) {
  await requireAccess(module, 'view');
  return requireAccess(module, action);
}
async function productForChange(id: number) {
  const row = await getCjProductById(id);
  if (!row) redirect('/admin/suppliers/cj/browse?error=not_found');
  return row;
}
async function auditProduct(actorId: number, before: Awaited<ReturnType<typeof productForChange>>) {
  await auditCjChange(actorId, 'products', before.id, cjProductAudit(before), cjProductAudit(await getCjProductById(before.id)));
}

/** حفظ الهامش الافتراضي (٪) — للمشرف فقط. لا شراء ولا اتصال بمورّد هنا. */
export async function saveCjMargin(form: FormData) {
  const s = await requireCjAccess('pricing', 'manage_settings');
  const pct = Number(String(form.get('marginPercent') || '').trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) redirect('/admin/suppliers/cj?error=margin');
  const before = await defaultMarginBps();
  await setDefaultMarginBps(Math.round(pct * 100));
  await auditCjChange(s.uid, 'pricing', 'margin', { bps: before }, { bps: await defaultMarginBps() });
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
  const s = await requireCjAccess('integrations', 'manage_settings');
  const before = await cjSyncSettings();
  const rate = numField(form, 'usdToSar'); // يُدخَل بالريال (٣٫٧٥) ويُخزَّن ×١٠٠
  await saveCjSyncSettings({
    enabled: String(form.get('enabled') || '') === '1',
    pageSize: numField(form, 'pageSize'),
    maxPages: numField(form, 'maxPages'),
    usdToSarX100: rate !== undefined ? Math.round(rate * 100) : undefined,
    shippingMinor: (() => { const s = numField(form, 'shippingSar'); return s !== undefined ? Math.round(s * 100) : undefined; })(),
  });
  await auditCjChange(s.uid, 'integrations', 'sync', before, await cjSyncSettings());
  revalidatePath('/admin/suppliers/cj');
  redirect('/admin/suppliers/cj?saved=sync');
}

/** مزامنة الآن (يدوية) — تتجاوز مفتاح الجدولة. قراءة فقط، لا شراء. */
export async function runCjSync() {
  const s = await requireCjAccess('integrations', 'sync');
  const r = await syncCjCatalog({ force: true });
  await auditCjChange(s.uid, 'integrations', 'sync', {}, r.ok ? { imported: r.imported, pages: r.pages, skipped: r.skipped } : { failed: true });
  if (r.ok) redirect(`/admin/suppliers/cj?synced=1&imported=${r.imported}&pages=${r.pages}&skipped=${r.skipped}`);
  redirect(`/admin/suppliers/cj?syncerr=${encodeURIComponent(r.error)}`);
}

/** استيراد منتج CJ مختار (بمعرّفه) إلى التخزين الوسيط مع تسعيره — لا يُعرض للعامة. */
export async function importCjProduct(form: FormData) {
  const s = await requireCjAccess('products', 'create');
  const pid = String(form.get('pid') || '').trim();
  const back = backOf(form);
  // Reimport updates existing rows; creation alone must not authorize editing.
  const existing = await prisma.cj_products.findMany({ where: { cj_product_id: pid }, select: { id: true } });
  if (existing.length) await requireCjAccess('products', 'edit');
  const r = await importCjProductByPid(pid, { createOnly: !await hasAccess(s.uid, 'products', 'edit') });
  if (r.ok) await auditCjChange(s.uid, 'products', pid, { imported: existing.length > 0 }, { imported: true, price: r.salePriceMinor, cost: r.supplierCostMinor });
  const sep = back.includes('?') ? '&' : '?';
  if (r.ok) redirect(`${back}${sep}imported=${encodeURIComponent(r.pid)}`);
  redirect(`${back}${sep}imperr=${encodeURIComponent(r.error)}`);
}

/** حذف منتج مستورد من التخزين الوسيط (لا يمسّ أي منتج عام). */
export async function removeCjProduct(form: FormData) {
  const s = await requireCjAccess('products', 'delete');
  const id = Number(String(form.get('id') || ''));
  const before = await productForChange(id);
  const back = backOf(form);
  if (await cjProductOrderCount(before.cj_product_id) > 0) redirect(withParam(back, 'error=has_activity'));
  await removeCjProductById(id);
  await auditProduct(s.uid, before);
  revalidatePath('/admin/suppliers/cj/browse');
  const sep = back.includes('?') ? '&' : '?';
  redirect(`${back}${sep}removed=1`);
}

const backOf = (form: FormData) => {
  const fallback = '/admin/suppliers/cj/browse';
  const raw = String(form.get('back') || fallback);
  // Exact local destinations only; reject encoded paths, backslashes and traversal.
  if (!/^\/admin\/suppliers\/cj(?:\/(?:browse|showcase|agents|orders(?:\/[1-9]\d*)?|review\/[1-9]\d*))?(?:\?[^#\r\n\\]*)?$/.test(raw)) return fallback;
  return raw;
};
const withParam = (back: string, kv: string) => `${back}${back.includes('?') ? '&' : '?'}${kv}`;

/** Explicit editor action: translate only server-fetched browse names, never posted product content. */
export async function translateCjBrowsePage(form: FormData) {
  const session = await requireCjAccess('products', 'edit');
  const back = backOf(form);
  const values = ['page', 'q', 'cat', 'detail'].map(key => form.get(key) ?? (key === 'page' ? '1' : ''));
  if (values.some(value => typeof value !== 'string') || ['page', 'q', 'cat', 'detail'].some(key => form.getAll(key).length > 1)) redirect(withParam(back, 'page_translation=invalid'));
  const [rawPage, q, cat, detail] = values as string[];
  const page = Number(rawPage);
  if (!/^[1-9]\d{0,4}$/.test(rawPage) || page > 10000 || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) || [cat, detail].some(value => value && !/^[0-9A-Za-z_-]{1,64}$/.test(value))) redirect(withParam(back, 'page_translation=invalid'));
  const queryFingerprint = cjAuditFingerprint(JSON.stringify({ page, q, cat, detail }));
  let requested = 0, available = 0;
  let outcome: 'complete' | 'partial' | 'empty' | 'unavailable' = 'unavailable';
  try {
    const result = await listProductsPage(page, 24, { productName: q || undefined, categoryId: cat || undefined });
    if (!result.ok) throw new Error('browse_unavailable');
    const items = result.data.items.slice(0, 24);
    const names = new Set<string>();
    const add = (value: string | null | undefined) => {
      if (typeof value !== 'string' || !value.trim() || names.size >= 100 || Buffer.byteLength(value, 'utf8') > 20000) return;
      names.add(value.trim());
    };
    for (const product of items) { add(product.productName); add(product.categoryName); }
    // Optional details must belong to this server-fetched page. No inventory,
    // imports, product updates, publishing or order calls are involved.
    if (detail && items.some(product => product.pid === detail)) {
      const selected = await getProduct(detail);
      if (selected.ok && selected.data.pid === detail) {
        add(selected.data.productName); add(selected.data.categoryName);
        for (const variant of selected.data.variants.slice(0, 48)) add(variant.variantName);
      }
    }
    const sources = [...names]; requested = sources.length;
    if (!sources.length) outcome = items.length ? 'unavailable' : 'empty';
    else {
      // Collect at most 98 page/detail names, but translate only 48 missing
      // entries per action. Repeated clicks advance through the remaining set.
      const translated = await translateManyCached(sources, 48);
      available = sources.filter(source => isArabicText(source) || isArabicText(translated.get(source))).length;
      outcome = available === requested ? 'complete' : available ? 'partial' : 'unavailable';
    }
  } catch { /* Provider/cache diagnostics never enter the redirect or audit. */ }
  try {
    await auditCjChange(session.uid, 'products', 'browse-translation', {}, { queryFingerprint, requested, available });
  } catch { outcome = 'unavailable'; }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(back, `page_translation=${outcome}`));
}

/** حفظ العنوان العربي المعروض (تحرير يدوي) — لا يمسّ النص المصدر. */
export async function saveCjArabic(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const id = Number(String(form.get('id') || ''));
  const before = await productForChange(id);
  const nameAr = String(form.get('nameAr') || '').trim();
  await setCjProductNameAr(id, nameAr);
  await auditProduct(s.uid, before);
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** تعديل سعر البيع النهائي بالريال (أو تركه فارغاً للعودة للسعر المحسوب). */
export async function saveCjPrice(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const id = Number(String(form.get('id') || ''));
  const before = await productForChange(id);
  const raw = String(form.get('priceSar') || '').trim();
  if (raw === '') await setCjProductPriceOverride(id, null);
  else { const v = Number(raw); if (Number.isFinite(v) && v >= 0) await setCjProductPriceOverride(id, Math.round(v * 100)); }
  await auditProduct(s.uid, before);
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** إخفاء/إظهار السلعة من المعاينة. */
export async function toggleCjHidden(form: FormData) {
  const s = await requireCjAccess('products', 'suspend');
  const id = Number(String(form.get('id') || ''));
  const before = await productForChange(id);
  const hidden = String(form.get('hidden') || '') === '1';
  await setCjProductHidden(id, hidden);
  await auditProduct(s.uid, before);
  revalidatePath('/admin/suppliers/cj/browse');
  revalidatePath('/admin/suppliers/cj/showcase');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** ترجمة تلقائية لعنوان سلعة واحدة (إعادة ترجمة عند الطلب). */
export async function translateCjProduct(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const id = Number(String(form.get('id') || ''));
  const row = await getCjProductById(id);
  if (row) { const ar = await translateToArabicCached(row.name).catch(() => null); if (ar) await setCjProductNameAr(id, ar); }
  if (row) await auditProduct(s.uid, row);
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'edited=1'));
}

/** حفظ شاشة المراجعة الكاملة لسلعة مستوردة (عنوان/وصف/تصنيف/حالة/سعر/إخفاء). */
export async function saveCjReview(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const id = Number(String(form.get('id') || ''));
  const before = await productForChange(id);
  if (form.has('status')) await requireCjAccess('products', 'approve');
  const visibility = form.has('manageVisibility') || form.has('hidden');
  if (visibility) await requireCjAccess('products', 'suspend');
  await updateCjReview(id, {
    nameAr: String(form.get('nameAr') || '').trim(),
    descriptionAr: String(form.get('descriptionAr') || '').trim(),
    trbhhCategory: String(form.get('trbhhCategory') || '').trim(),
    ...(form.has('status') ? { status: String(form.get('status') || 'draft') } : {}),
  });
  const rawPrice = String(form.get('priceSar') || '').trim();
  if (rawPrice === '') await setCjProductPriceOverride(id, null);
  else { const v = Number(rawPrice); if (Number.isFinite(v) && v >= 0) await setCjProductPriceOverride(id, Math.round(v * 100)); }
  if (visibility) await setCjProductHidden(id, String(form.get('hidden') || '') === '1');
  await auditProduct(s.uid, before);
  revalidatePath('/admin/suppliers/cj/browse');
  revalidatePath('/admin/suppliers/cj/showcase');
  redirect(`/admin/suppliers/cj/review/${id}?saved=1`);
}

/* ------------------------- طلبات CJ (بنية/اختبار — لا شراء حقيقي) ------------------------- */

/** اعتماد حالة العرض مستقل عن تحرير المحتوى والسعر. */
export async function approveCjProduct(form: FormData) {
  const s = await requireCjAccess('products', 'approve');
  const id = Number(String(form.get('id') || ''));
  const before = await productForChange(id);
  await setCjProductStatus(id, String(form.get('status') || 'draft'));
  await auditProduct(s.uid, before);
  revalidatePath('/cj');
  revalidatePath('/admin/suppliers/cj/showcase');
  redirect(`/admin/suppliers/cj/review/${id}?saved=1`);
}

/** إنشاء طلب اختبار داخلي لتجربة دورة الحالات (لا اتصال بـ CJ ولا دفع). */
export async function createTestCjOrder() {
  const s = await requireCjAccess('orders', 'create');
  const ref = `TEST-${Date.now()}`;
  const { id } = await createOrder({ internalRef: ref, userId: s.uid, productName: 'طلب اختبار داخلي', currency: 'SAR' }, s.uid);
  await auditCjChange(s.uid, 'orders', String(id), { exists: false }, { exists: true, status: 'awaiting_payment' });
  redirect(`/admin/suppliers/cj/orders/${id}`);
}

/** تحريك حالة الطلب يدوياً (اختبار آلة الحالات) — يتحقق من صلاحية الانتقال server-side. */
export async function advanceCjOrder(form: FormData) {
  const s = await requireCjAccess('orders', 'edit');
  const id = Number(String(form.get('id') || ''));
  const to = String(form.get('to') || '');
  if (to === 'refunded') await requireCjAccess('orders', 'refund');
  const reason = String(form.get('reason') || '').trim();
  const r = await transitionOrder(id, to, { source: 'internal', actorId: s.uid, reason });
  if (r.ok) await auditCjChange(s.uid, 'orders', id, { status: r.from }, { status: r.to });
  const q = r.ok ? 'moved=1' : `err=${encodeURIComponent(r.error)}`;
  revalidatePath(`/admin/suppliers/cj/orders/${id}`);
  redirect(`/admin/suppliers/cj/orders/${id}?${q}`);
}

/** تحديث بيانات التتبّع يدوياً (اختبار) — شركة الشحن ورقم/رابط التتبّع. */
export async function setCjOrderTracking(form: FormData) {
  const s = await requireCjAccess('shipping', 'edit');
  const id = Number(String(form.get('id') || ''));
  const before = await getOrderById(id);
  await setOrderTracking(id, {
    carrier: String(form.get('carrier') || '').trim(),
    trackingNumber: String(form.get('trackingNumber') || '').trim(),
    trackingUrl: String(form.get('trackingUrl') || '').trim(),
  }, { source: 'internal', actorId: s.uid });
  const after = await getOrderById(id);
  await auditCjChange(s.uid, 'shipping', id,
    { carrier: cjAuditFingerprint(before?.carrier), number: cjAuditFingerprint(before?.tracking_number), url: cjAuditFingerprint(before?.tracking_url) },
    { carrier: cjAuditFingerprint(after?.carrier), number: cjAuditFingerprint(after?.tracking_number), url: cjAuditFingerprint(after?.tracking_url) });
  revalidatePath(`/admin/suppliers/cj/orders/${id}`);
  redirect(`/admin/suppliers/cj/orders/${id}?tracked=1`);
}

/** ترجمة أسماء تصنيفات CJ إلى العربية وتخزينها (دفعة محدودة لكل ضغطة). */
export async function translateCjCategories(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const back = backOf(form);
  const cats = await getCategories();
  let done = 0;
  if (cats.ok) { const map = await translateManyCached(cats.data.map((c) => c.name), 120); done = map.size; }
  await auditCjChange(s.uid, 'products', 'category-translations', {}, { processed: done });
  redirect(withParam(back, `cattr=${done}`));
}

/* ------------------------- الوكلاء ------------------------- */

const AG = '/admin/suppliers/cj/agents';

/** حفظ الحصّة الأسبوعية الافتراضية للوكلاء. */
export async function saveAgentQuota(form: FormData) {
  const s = await requireCjAccess('integrations', 'manage_settings');
  const before = await defaultAgentWeeklyQuota();
  const n = Number(String(form.get('weeklyQuota') || '').trim());
  if (Number.isFinite(n) && n >= 0) await setDefaultAgentWeeklyQuota(Math.floor(n));
  await auditCjChange(s.uid, 'agents', 'default-quota', { quota: before }, { quota: await defaultAgentWeeklyQuota() });
  redirect(`${AG}?saved=quota`);
}

/** منح عضو دور وكيل (بحثاً بالبريد/الجوال/اسم الدخول) مع جواله وواتسه وحصّته. */
export async function saveAgent(form: FormData) {
  const s = await requireCjAccess('integrations', 'manage_settings');
  const ident = String(form.get('ident') || '').trim();
  if (!ident) redirect(`${AG}?err=no_ident`);
  const tail = ident.replace(/\D+/g, '').slice(-9);
  const user = await prisma.users.findFirst({
    where: { OR: [{ email: ident }, { userName: ident }, ...(tail ? [{ phoneNumber: { endsWith: tail } }] : [])] },
    select: { id: true, phoneNumber: true },
  }).catch(() => null);
  if (!user) redirect(`${AG}?err=not_found`);
  const before = await getAgent(user.id);
  const phone = String(form.get('phone') || '').trim() || user!.phoneNumber || '';
  const whatsapp = String(form.get('whatsapp') || '').trim() || phone;
  const quotaRaw = String(form.get('weeklyQuota') || '').trim();
  await upsertAgent({
    userId: user!.id, phone, whatsapp,
    weeklyQuota: quotaRaw === '' ? undefined : Number(quotaRaw),
    active: true, notes: String(form.get('notes') || '').trim(),
  });
  const after = await getAgent(user.id);
  await auditCjChange(s.uid, 'agents', String(user.id),
    { active: before?.active ?? null, quota: before?.weekly_quota ?? null, contact: cjAuditFingerprint(`${before?.phone || ''}|${before?.whatsapp || ''}`), notes: cjAuditFingerprint(before?.notes) },
    { active: after?.active ?? null, quota: after?.weekly_quota ?? null, contact: cjAuditFingerprint(`${after?.phone || ''}|${after?.whatsapp || ''}`), notes: cjAuditFingerprint(after?.notes) });
  redirect(`${AG}?saved=agent`);
}

/** تفعيل/إيقاف وكيل. */
export async function toggleAgent(form: FormData) {
  const s = await requireCjAccess('integrations', 'manage_settings');
  const uid = Number(String(form.get('userId') || ''));
  const active = String(form.get('active') || '') === '1';
  if (Number.isInteger(uid) && uid > 0) {
    const before = await getAgent(uid);
    await setAgentActive(uid, active);
    await auditCjChange(s.uid, 'agents', uid, { active: before?.active ?? null }, { active: (await getAgent(uid))?.active ?? null });
  }
  redirect(`${AG}?saved=toggle`);
}

/** إسناد/فك سلعة لوكيل من الإدارة. */
export async function assignAgentToProduct(form: FormData) {
  const s = await requireCjAccess('integrations', 'manage_settings');
  const productId = Number(String(form.get('productId') || ''));
  const agentUserId = Number(String(form.get('agentUserId') || ''));
  const back = backOf(form);
  if (Number.isInteger(productId) && productId > 0) {
    const before = await productForChange(productId);
    if (Number.isInteger(agentUserId) && agentUserId > 0) await assignProductAgent(productId, agentUserId);
    else await unassignProductAgent(productId);
    const after = await getCjProductById(productId);
    await auditCjChange(s.uid, 'agents', `product:${productId}`, { agent: before.agent_user_id?.toString() ?? null }, { agent: after?.agent_user_id?.toString() ?? null });
  }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(back, 'edited=1'));
}

/** كل إجراء يتطلب صلاحيته الدقيقة أو ملكية الوكيل النشط لهذه السلعة. */
async function ensureCjProductManager(productId: number, action: 'edit' | 'suspend' | 'delete') {
  const session = await getSession();
  if (!session) redirect('/login');
  const product = await getCjProductById(productId);
  if (!product || !(await cjProductCapabilities(session.uid, product.agent_user_id))[action]) redirect('/account?access=denied');
  return { session, product };
}

/** تعديل مباشر من صفحة السلعة (الإدارة أو وكيل السلعة) — يحدّث العرض ويُعلّم الترجمة. */
export async function saveCjStorefrontEdit(form: FormData) {
  const id = Number(String(form.get('id') || ''));
  const { session, product: row } = await ensureCjProductManager(id, 'edit');
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
  await auditProduct(session.uid, row);
  revalidatePath(`/cj/${id}`);
  revalidatePath('/cj');
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(`/cj/${id}?edited=1`);
}

/** إخفاء/إظهار السلعة من صفحتها (الإدارة أو وكيلها). */
export async function hideCjStorefront(form: FormData) {
  const id = Number(String(form.get('id') || ''));
  const { session, product } = await ensureCjProductManager(id, 'suspend');
  await setCjProductHidden(id, String(form.get('hidden') || '') === '1');
  await auditProduct(session.uid, product);
  revalidatePath(`/cj/${id}`);
  revalidatePath('/cj');
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(`/cj/${id}?edited=1`);
}

/** حذف السلعة (الإدارة أو وكيلها) — يُمنع إن كان لها نشاط (طلبات/تعليقات). */
export async function deleteCjStorefront(form: FormData) {
  const id = Number(String(form.get('id') || ''));
  const { session, product } = await ensureCjProductManager(id, 'delete');
  if (product && (await cjProductOrderCount(product.cj_product_id)) > 0) {
    redirect(`/cj/${id}?err=has_activity`);
  }
  await removeCjProductById(id);
  await auditProduct(session.uid, product);
  revalidatePath('/cj');
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(`/cj?removed=1`);
}

/** تفعيل/إيقاف إظهار متجر CJ للعامة (بعد نجاح التجربة). الشراء يبقى معطّلاً بمفتاحه. */
export async function setCjStorefront(form: FormData) {
  const on = String(form.get('value') || '') === '1';
  const s = await requireCjAccess('products', on ? 'approve' : 'suspend');
  const before = await cjStorefrontPublic();
  await setCjStorefrontPublic(on);
  await auditCjChange(s.uid, 'products', 'storefront', { public: before }, { public: await cjStorefrontPublic() });
  revalidatePath('/admin/suppliers/cj/showcase');
  revalidatePath('/cj');
  redirect(`/admin/suppliers/cj/showcase?published=${on ? '1' : '0'}`);
}

/** تحديث كل الترجمات الآن (تصنيفات + حقول السلع المستوردة) وتخزينها على الخادم. */
export async function runCjTranslateWarm(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const back = backOf(form);
  const r = await warmCjTranslations({ categoryMax: 150, productMax: 40 });
  await auditCjChange(s.uid, 'products', 'translation-warm', {}, r);
  redirect(withParam(back, `warmed=${r.categories}-${r.productNames}-${r.productCategories}`));
}

/** إعادة جلب صور ومواصفات كل السلع المستوردة (يُصلح الصور المكسورة). */
export async function refreshCjMediaAction(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const back = backOf(form);
  const r = await refreshCjMedia(30);
  await auditCjChange(s.uid, 'products', 'media-refresh', {}, r);
  redirect(withParam(back, `mediaref=${r.refreshed}`));
}

/** Refresh one imported item's source images, full stock and Saudi shipping proof. */
export async function refreshCjImportedAvailability(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const id = Number(String(form.get('id') || ''));
  const back = backOf(form);
  const before = await productForChange(id);
  const detail = await getProduct(before.cj_product_id).catch(() => null);
  if (!detail?.ok) {
    await setCjProductAvailability(id, null);
    await auditProduct(s.uid, before);
    return redirect(withParam(back, 'availability=missing'));
  }
  const images = collectCjProductImages(detail.data);
  if (images.length) await setCjProductGallery(id, images);
  // إعادة استيراد قائمة المتغيّرات/الخيارات كاملة من الـ API (نقطة المتغيّرات المخصّصة
  // أكمل من المضمّنة)، وتحديث التفاصيل المخزّنة (details_json) فتظهر الخيارات في العرض.
  const detailVariants = detail.data.variants ?? [];
  const variantsRes = await cjGetVariants(before.cj_product_id).catch(() => null);
  const queryVariants = variantsRes?.ok ? variantsRes.data : [];
  const fullVariants = queryVariants.length >= detailVariants.length ? queryVariants : detailVariants;
  await setCjProductDetails(id, buildCjDetails(fullVariants));
  const availability = await readCjAvailability(before.cj_product_id, fullVariants);
  await setCjProductAvailability(id, availability);
  // ترجمة الحقول العربية الناقصة تلقائياً (اسم/وصف/تصنيف) فيكفي زر واحد لمعالجة السلعة كاملة.
  if (!before.name_ar && before.name) { const ar = await translateToArabicCached(before.name).catch(() => null); if (ar) await setCjProductNameAr(id, ar); }
  if (!before.display_description_ar && before.source_description) {
    const plain = String(before.source_description).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s{2,}/g, ' ').trim();
    const ar = plain ? await translateToArabicCached(plain).catch(() => null) : null; if (ar) await setCjProductDescriptionAr(id, ar);
  }
  if (before.source_category && !isArabicText(before.trbhh_category)) { const ar = await translateToArabicCached(before.source_category).catch(() => null); if (ar) await setCjProductCategory(id, ar); }
  await auditProduct(s.uid, before);
  revalidatePath('/admin/suppliers/cj/browse');
  revalidatePath('/admin/suppliers/cj/showcase');
  redirect(withParam(back, availability ? 'availability=ready' : 'availability=missing'));
}

/** حفظ مفاتيح مزوّدي الترجمة من لوحة التحكم (لا أسرار في الكود/‏.env). المفتاح الفارغ
 *  يُبقي القيمة الحالية (تفادي مسح المفتاح بالخطأ)؛ البريد يُحفظ كما هو (غير سرّي). */
export async function saveCjTranslationSettings(form: FormData) {
  await requireCjAccess('integrations', 'manage_settings');
  const { setSetting } = await import('@/lib/settings');
  const libreUrl = String(form.get('libreUrl') || '').trim();
  const libreKey = String(form.get('libreKey') || '').trim();
  const deeplKey = String(form.get('deeplKey') || '').trim();
  const email = String(form.get('mymemoryEmail') || '').trim();
  await setSetting('cj_libretranslate_url', libreUrl.slice(0, 300));
  if (libreKey) await setSetting('cj_libretranslate_key', libreKey.slice(0, 200));
  if (deeplKey) await setSetting('cj_deepl_api_key', deeplKey.slice(0, 200));
  await setSetting('cj_mymemory_email', email.slice(0, 120));
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), 'transcfg=1'));
}

/** ترجمة تلقائية جماعية لكل سلعة بلا عنوان عربي بعد (دفعة محدودة). */
export async function translateAllCj(form: FormData) {
  const s = await requireCjAccess('products', 'edit');
  const rows = await listUntranslatedCjProducts(40);
  let done = 0;
  for (const r of rows) { const ar = await translateToArabicCached(r.name).catch(() => null); if (ar) { await setCjProductNameAr(r.id, ar); await auditProduct(s.uid, r); done++; } }
  revalidatePath('/admin/suppliers/cj/browse');
  redirect(withParam(backOf(form), `translated=${done}`));
}

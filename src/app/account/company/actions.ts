'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { saveStoreMeta, markStorePending, agreeStoreTerms, setStoreProducts, setStoreHandle, requestPlatform, saveStoreSettings, setStorePassword, setStoreUsername, STORE_HIDE_KEYS } from '@/lib/merchant';
import { toInt } from '@/lib/utils';
import { scanContent } from '@/lib/content-guard';
import { handleProhibited } from '@/lib/moderation';

/** Owner subscribes/renews the store to a plan (monthly/6mo/yearly), charged from wallet. */
export async function subscribeStoreAction(formData: FormData) {
  const session = await requireUser();
  const raw = String(formData.get('plan') || '');
  const plan = raw === 'monthly' || raw === 'sixmo' || raw === 'yearly' ? raw : null;
  if (!plan) redirect('/store?sub=error');
  const { subscribeStore } = await import('@/lib/subscription');
  const r = await subscribeStore(session.uid, plan);
  revalidatePath('/store');
  revalidatePath('/');
  if (!r.ok) redirect('/store?sub=nocredit');
  redirect('/store?sub=ok');
}

/** Owner sets/changes the dedicated store-login credentials (username + password), separate from Trbhh.
 *  Username must be unique across stores; password (optional) must meet the minimum length. */
export async function setStoreCredentialsAction(formData: FormData) {
  const session = await requireUser();
  const username = String(formData.get('storeUsername') || '').trim();
  const pw = String(formData.get('storePassword') || '');
  // اسم فارغ = إبقاء الاسم الحالي كما هو (لا يُمسح عند تعديل كلمة المرور فقط)
  if (username) {
    const u = await setStoreUsername(session.uid, username);
    if (!u.ok) redirect(`/store?crederr=${encodeURIComponent(u.msg)}`);
  }
  if (pw) {
    const okPw = await setStorePassword(session.uid, pw); // blank = keep current password
    if (!okPw) redirect(`/store?crederr=${encodeURIComponent('كلمة المرور قصيرة جداً (4 خانات فأكثر).')}`);
  }
  revalidatePath('/store');
  redirect('/store?cred=ok');
}

/** Store toggles: allow publishing ads + lock/unlock reviews & comments. */
export async function saveStoreSettingsAction(formData: FormData) {
  const session = await requireUser();
  // كل حقل «إظهار» غير مُحدَّد => مُخفى (كل متجر يتحكم بحقوله بشكل مستقل)
  const hidden = STORE_HIDE_KEYS.filter((k) => formData.get(`show_${k}`) === null);
  // دوام المتجر: تُحفظ القيم فقط عندما تكون الميزة مفعّلة (حقولها ظاهرة في النموذج)
  const hoursPresent = formData.get('hoursPresent') !== null;
  const hFrom = String(formData.get('hoursFrom') || '').trim();
  const hTo = String(formData.get('hoursTo') || '').trim();
  const hDays = formData.getAll('hoursDay').map((v) => Number(v)).filter((n) => Number.isFinite(n));
  const msgTemplates = String(formData.get('msgTemplates') || '');
  const announce = String(formData.get('announce') || '');
  const productNote = String(formData.get('productNote') || '');
  const badContent = await scanContent(msgTemplates, announce, productNote);
  if (badContent) {
    const o = await handleProhibited(session.uid, badContent.category, badContent.term, `${msgTemplates} ${announce} ${productNote}`);
    redirect(`/store?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : ''}`);
  }
  await saveStoreSettings(session.uid, {
    allowAds: formData.get('allowAds') !== null,
    allowReviews: formData.get('allowReviews') !== null,
    msgTemplates,
    hidden,
    announce,
    productNote,
    ...(hoursPresent ? { hours: hFrom && hTo ? { from: hFrom, to: hTo, days: hDays } : null } : {}),
  });
  revalidatePath('/store');
  revalidatePath('/');
  redirect('/store?settings=1');
}

export async function saveCompanyAction(formData: FormData) {
  const session = await requireUser();
  const description = String(formData.get('description') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const storeName = String(formData.get('storeName') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const about = String(formData.get('about') || '').trim();
  const banner = String(formData.get('banner') || '').trim();
  const tagline = String(formData.get('tagline') || '').trim();
  const layout = String(formData.get('layout') || '').trim();
  const catalog = String(formData.get('catalog') || '').trim();
  const fields = String(formData.get('fields') || '').trim();
  const since = String(formData.get('since') || '').trim();
  const specialty = String(formData.get('specialty') || '').trim();
  const audience = String(formData.get('audience') || '').trim();
  const handle = String(formData.get('handle') || '').trim();
  const nationalId = String(formData.get('nationalId') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const contacts = String(formData.get('contacts') || '').trim();
  const agreeTerms = !!formData.get('agreeTerms');

  // أسماء المتاجر المخالفة (كلمات/جمل مرفوضة) لا تُقبل إلا من الإدارة
  const { containsBannedName } = await import('@/lib/censor');
  if ((await containsBannedName(storeName)) || (await containsBannedName(tagline))) {
    redirect('/store?error=badname');
  }
  // فحص حارس المحتوى (غير أخلاقي/مخدرات/أسلحة/سياسي/جمعيات) على كل حقول المتجر
  // النصية العامة — نفس فحص الإعلان تماماً، فبيانات المتجر تظهر للجميع وتبقى معلّقة.
  const badContent = await scanContent(storeName, description, about, banner, tagline, catalog, specialty, audience, contacts);
  if (badContent) {
    const o = await handleProhibited(session.uid, badContent.category, badContent.term, `${storeName} ${description} ${about} ${tagline}`.slice(0, 300));
    redirect(`/store?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : ''}`);
  }
  // تفرّد الاسم: تشابه ٩٠٪+ مع متجر آخر يُرفض برسالة تعرض المتجر المشابه
  // (بلا إنذار أو عقوبة — محاولات مفتوحة، أو طلب استثناء للإدارة)
  if (storeName) {
    const { findSimilarStoreName } = await import('@/lib/merchant');
    const clash = await findSimilarStoreName(session.uid, storeName);
    if (clash) redirect(`/store?error=namedup&other=${clash.id}&othername=${encodeURIComponent(clash.name.slice(0, 60))}&want=${encodeURIComponent(storeName.slice(0, 120))}`);
  }
  // تعديل اسم متجر قائم = بطلب وموافقة إدارة المتاجر (أول تسمية تُحفظ مباشرة):
  // يُنشأ طلب تغيير الاسم ويبقى الاسم الحالي حتى الموافقة — بقية الإعدادات تُحفظ عادي
  const currentStore = await prisma.stores.findFirst({ where: { user_id: session.uid }, select: { store_name: true, specialty: true } }).catch(() => null);
  const currentName = (currentStore?.store_name || '').trim();
  let effectiveName = storeName;
  let nameRequestFlag: '' | '1' | 'dup' = '';
  if (currentName && storeName && storeName !== currentName) {
    effectiveName = currentName; // لا يتغيّر إلا بموافقة الإدارة
    const pendingReq = await prisma.name_requests.findFirst({ where: { user_id: BigInt(session.uid), kind: 'store', status: 0 } }).catch(() => null);
    if (pendingReq) {
      nameRequestFlag = 'dup';
    } else {
      await prisma.name_requests.create({
        data: { user_id: BigInt(session.uid), kind: 'store', old_name: currentName, new_name: storeName.slice(0, 120), reason: 'طلب تعديل اسم المتجر (بموافقة إدارة المتاجر)' },
      }).catch(() => {});
      nameRequestFlag = '1';
    }
  }
  // تعديل نشاط المتجر القائم = بطلب وموافقة إدارة المتاجر (أول إضافة تُحفظ مباشرة)
  const currentSpecialty = (currentStore?.specialty || '').trim();
  let effectiveSpecialty = specialty;
  let actRequestFlag: '' | '1' | 'dup' = '';
  if (currentSpecialty && specialty && specialty !== currentSpecialty) {
    effectiveSpecialty = currentSpecialty; // لا يتغيّر إلا بموافقة الإدارة
    const pendingAct = await prisma.name_requests.findFirst({ where: { user_id: BigInt(session.uid), kind: 'storeact', status: 0 } }).catch(() => null);
    if (pendingAct) {
      actRequestFlag = 'dup';
    } else {
      await prisma.name_requests.create({
        data: { user_id: BigInt(session.uid), kind: 'storeact', old_name: currentSpecialty.slice(0, 120), new_name: specialty.slice(0, 120), reason: 'طلب تعديل نشاط المتجر (بموافقة إدارة المتاجر)' },
      }).catch(() => {});
      actRequestFlag = '1';
    }
  }

  let logoId: number | undefined;
  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) {
    const ext = (logo.name.split('.').pop() || 'png').toLowerCase();
    const buf = Buffer.from(await logo.arrayBuffer());
    const rel = await saveUpload(buf, `store_${session.uid}_${Date.now()}.${ext}`);
    const up = await prisma.uploads.create({ data: { file_name: rel, extension: ext, type: 'store', file_size: logo.size, user_id: session.uid } });
    logoId = toInt(up.id);
  }

  const existing = await prisma.stores.findFirst({ where: { user_id: session.uid } });
  if (existing) {
    await prisma.stores.update({ where: { id: existing.id }, data: { description, address, ...(logoId ? { logo: logoId } : {}) } });
  } else {
    // فتح متجر جديد يتطلب الموافقة على شروط المتجر وتحمّل مسؤولية المنتجات
    if (!agreeTerms) redirect('/store?error=terms');
    // status: 0 صراحةً هنا — العمود الافتراضي في القاعدة 1 (نشِط)، والاعتماد فقط
    // على استدعاء markStorePending التالي (وهو .catch صامت) قد يترك متجراً
    // معتمَداً وظاهراً للعامة تلقائياً لو فشل ذلك الاستدعاء لأي خلل عابر.
    await prisma.stores.create({ data: { user_id: session.uid, description, address, logo: logoId ?? 0, status: 0 } });
    await markStorePending(session.uid); // احتياط إضافي (لا يضر تكراره)
    await agreeStoreTerms(session.uid);
    // منح فترة تجربة مجانية عند فتح المتجر (تبدأ فور الإنشاء)
    const { startStoreTrial } = await import('@/lib/subscription');
    await startStoreTrial(session.uid);
  }
  await saveStoreMeta(session.uid, { storeName: effectiveName, color, about, banner, tagline, layout, catalog, fields, since, specialty: effectiveSpecialty, audience, nationalId, phone, email, contacts });
  if (handle || existing) await setStoreHandle(session.uid, handle);
  revalidatePath('/store');
  // طُلب تغيير الاسم/النشاط؟ نعود للوحة المتجر برسالة توضح حالة الطلب
  if (nameRequestFlag) redirect(`/store?nreq=${nameRequestFlag}${actRequestFlag ? `&areq=${actRequestFlag}` : ''}`);
  if (actRequestFlag) redirect(`/store?areq=${actRequestFlag}`);
  // land the merchant on their own (independent) store page
  const mine = await prisma.stores.findFirst({ where: { user_id: session.uid }, select: { id: true } });
  redirect(mine ? `/companies/${toInt(mine.id)}` : '/store');
}

/** طلب استثناء اسم متجر مشابه: يُرسل للإدارة (طلبات تغيير الاسم) وتوافق أو ترفض. */
export async function requestStoreNameExceptionAction(formData: FormData) {
  const session = await requireUser();
  const want = String(formData.get('want') || '').trim().slice(0, 120);
  const reason = String(formData.get('reason') || '').trim().slice(0, 500);
  const other = String(formData.get('other') || '').trim().slice(0, 20);
  const othername = String(formData.get('othername') || '').trim().slice(0, 60);
  if (!want) redirect('/store');
  const pending = await prisma.name_requests.findFirst({ where: { user_id: BigInt(session.uid), kind: 'store', status: 0 } }).catch(() => null);
  if (pending) redirect('/store?exc=dup');
  const store = await prisma.stores.findFirst({ where: { user_id: session.uid }, select: { store_name: true } }).catch(() => null);
  const fullReason = `استثناء اسم متجر مشابه لمتجر «${othername || '—'}»${other ? ` (#${other})` : ''}${reason ? ` — مبرر التاجر: ${reason}` : ''}`;
  await prisma.name_requests.create({
    data: { user_id: BigInt(session.uid), kind: 'store', old_name: store?.store_name || '', new_name: want, reason: fullReason },
  }).catch(() => {});
  redirect('/store?exc=1');
}

/** مراسلة عضو من داخل لوحة المتجر: التاجر يدخل جوال العضو ورسالته —
 *  تصل العضو باسم المتجر في «الرسائل» ويستمر الحوار هناك. */
/** طلب توثيق مدفوع من صاحب المتجر — يبقى معلقاً حتى موافقة إدارة المتاجر (الخصم عند الموافقة فقط). */
export async function requestVerifyPaidAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  // التعهد بالالتزام بلوائح الموقع إلزامي قبل إرسال الطلب
  if (!formData.get('pledge')) redirect('/store?vreq=pledge');
  const pkgIdx = Math.max(1, Math.min(3, parseInt(String(formData.get('pkg') || '1')) || 1));
  const { requestPaidVerification } = await import('@/lib/verify-paid');
  const r = await requestPaidVerification(session.uid, storeId, pkgIdx);
  revalidatePath('/store');
  redirect(`/store?vreq=${r}`);
}

export async function storeMessageMemberAction(formData: FormData) {
  const session = await requireUser();
  const store = await prisma.stores.findFirst({ where: { user_id: session.uid }, select: { id: true, store_name: true } }).catch(() => null);
  if (!store) redirect('/store');
  const phone = String(formData.get('phone') || '').trim();
  const raw = String(formData.get('message') || '').trim();
  if (!phone || !raw) redirect('/store?mm=err');
  const { toLocalSaudi } = await import('@/lib/sms');
  const local = toLocalSaudi(phone);
  const member = await prisma.users.findFirst({
    where: { OR: [{ phoneNumber: local }, { phoneNumber: phone }, { phoneNumber: local.replace(/^0/, '') }, { phoneNumber: `966${local.replace(/^0/, '')}` }] },
    select: { id: true },
  }).catch(() => null);
  if (!member) redirect('/store?mm=nouser');
  const memberId = toInt(member.id);
  if (memberId === session.uid) redirect('/store?mm=err');
  // نفس حماية المراسلات (حارس المحتوى والكلمات المرفوضة)
  const { screenChatMessage } = await import('@/lib/chat');
  const screened = await screenChatMessage(session.uid, `من متجر «${store.store_name || 'متجرنا'}»: ${raw.slice(0, 1500)}`);
  if (!screened.ok) redirect('/store?mm=blocked');
  await prisma.chats.create({
    data: { sender_id: session.uid, reciver_id: memberId, message: screened.text, is_read: 0, chat_id: 0, type_from_user: 'user', type_to_user: 'user' },
  }).catch(() => {});
  await prisma.notfications.create({ data: { title: `رسالة من متجر ${store.store_name || ''}`, route: `/messages/${session.uid}`, user_id: String(memberId), type: 'message' } }).catch(() => {});
  redirect('/store?mm=1');
}

/** Merchant requests to feature their products on the Trbhh platform (admin approves). */
export async function requestPlatformAction() {
  const session = await requireUser();
  await requestPlatform(session.uid);
  revalidatePath('/store');
}

/** Owner picks which of their ads are showcased in the (independent) store. */
export async function setStoreProductsAction(formData: FormData) {
  const session = await requireUser();
  const ids = formData.getAll('productIds').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  await setStoreProducts(session.uid, ids);
  revalidatePath('/store');
}

/** أخذ نسخة احتياطية يدوية لبيانات المتجر. */
export async function storeBackupNowAction() {
  const session = await requireUser();
  const { createSnapshot } = await import('@/lib/store-backup');
  await createSnapshot(session.uid, 'manual');
  revalidatePath('/store');
  redirect('/store?backup=done');
}

/** استعادة المتجر من نسخة محفوظة (بمعرّفها) — تستبدل الإعدادات الحالية. */
export async function storeRestoreAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id') || 0);
  const { restoreFromId } = await import('@/lib/store-backup');
  const ok = id ? await restoreFromId(session.uid, id) : false;
  revalidatePath('/store');
  revalidatePath('/');
  redirect(ok ? '/store?backup=restored' : '/store?backup=error');
}

/** استعادة المتجر من ملف نسخة احتياطية مرفوع. */
export async function storeRestoreFileAction(formData: FormData) {
  const session = await requireUser();
  const file = formData.get('file');
  let text = '';
  if (file instanceof File && file.size > 0 && file.size < 5_000_000) text = await file.text();
  const { restoreFromJson } = await import('@/lib/store-backup');
  const ok = text ? await restoreFromJson(session.uid, text) : false;
  revalidatePath('/store');
  revalidatePath('/');
  redirect(ok ? '/store?backup=restored' : '/store?backup=error');
}

export async function addBranchAction(formData: FormData) {
  const session = await requireUser();
  const store = await prisma.stores.findFirst({ where: { user_id: session.uid } });
  if (!store) return;
  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  if (!name) return;
  await prisma.store_branches.create({ data: { store_id: toInt(store.id), name, address } });
  revalidatePath('/store');
}


/** رفع منتجات دفعة واحدة من ملف CSV (يُصدَّر من Excel): العنوان،التفاصيل،السعر — حتى ٥٠ صفاً. */
export async function bulkUploadProductsAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser, addStoreProduct } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) redirect('/store?bulk=err');

  // فك الترميز: UTF-8 (مع BOM) ثم Windows-1256 لملفات Excel العربية القديمة
  const buf = Buffer.from(await file.arrayBuffer());
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { try { text = new TextDecoder('windows-1256').decode(buf); } catch { text = buf.toString('utf8'); } }
  text = text.replace(/^\uFEFF/, '');

  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { city_id: true, country_id: true } }).catch(() => null);
  const { getCategories } = await import('@/lib/data');
  const cats = await getCategories();
  const categoryId = Number(formData.get('category') || 0) || cats[0]?.id || 0;
  if (!categoryId) redirect('/store?bulk=err');
  // نفس بوابات النشر العادية: متجر معتمد يُنشر مباشرة، وإلا حسب إعداد المراجعة
  const [{ isApprovedStoreOwner }, { getSettingBool, SETTING_ADS_APPROVAL }, { scanContent }, { checkFlood, logMod }, { getUserPackage, countAdsToday, lastAdAt, logAdPublish }] = await Promise.all([
    import('@/lib/merchant'), import('@/lib/settings'), import('@/lib/content-guard'), import('@/lib/moderation'), import('@/lib/packages'),
  ]);
  const approvedOwner = await isApprovedStoreOwner(session.uid).catch(() => false);
  const requireApproval = approvedOwner ? false : await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false);

  // نفس حدود الباقة والإغراق المطبَّقة على الإعلان الفردي — الرفع بالجملة لا يتجاوزها إطلاقاً
  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect('/store?bulk=flood');
  const pkg = await getUserPackage(session.uid);
  if (pkg.gapHours > 0) {
    const last = await lastAdAt(session.uid);
    if (last && (Date.now() - last.getTime()) / 3600000 < pkg.gapHours) redirect('/store?bulk=gap');
  }
  const alreadyToday = await countAdsToday(session.uid);
  const dailyLeft = pkg.adsPerDay > 0 ? Math.max(0, pkg.adsPerDay - alreadyToday) : Infinity;
  let truncatedByLimit = false;

  let created = 0;
  const now = new Date();
  for (const line of rows) {
    // فاصلة أو فاصلة منقوطة (إعدادات Excel الإقليمية)
    const cols = line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const [title, detail = '', priceRaw = ''] = cols;
    if (!title || title.length < 3) continue;
    if (/^(العنوان|title)$/i.test(title)) continue; // صف العناوين
    if (created >= 50) break;
    if (created >= dailyLeft) { truncatedByLimit = true; break; }
    if (await scanContent(title, detail).catch(() => null)) continue; // حارس المحتوى: تخطَّ الصف المخالف
    const price = Math.max(0, parseInt(priceRaw.replace(/[^0-9]/g, ''), 10) || 0);
    try {
      const ad = await prisma.ads.create({
        data: {
          title: title.slice(0, 120),
          detail: (detail || title).slice(0, 3000),
          price,
          adsType: 'offer',
          category_id: BigInt(categoryId),
          city_id: user?.city_id ?? BigInt(0),
          country_id: user?.country_id ?? null,
          user_id: BigInt(session.uid),
          video_path: '',
          phoneAllow: 1,
          commentAllow: 1,
          adsSpecial: 'no',
          state: 'active',
          status: requireApproval ? 0 : 1,
          store_only: 1, // عزل تام: منتجات المتجر لا تظهر في تربح
          bumped_at: now,
          created_at: now,
        },
      });
      await addStoreProduct(session.uid, toInt(ad.id)).catch(() => {});
      await logAdPublish(session.uid);
      created++;
    } catch { /* صف تالف — تخطَّ */ }
  }
  if (truncatedByLimit) {
    await logMod(session.uid, { kind: 'limit', action: 'blocked', snippet: `رفع بالجملة: توقف عند ${created} بعد بلوغ الحد اليومي (${pkg.adsPerDay}/يوم)` });
    const { notifyModBlock } = await import('@/lib/moderation');
    await notifyModBlock(session.uid, `⚠️ لقد تجاوزت الحد المسموح لك من الإعلانات اليوم (${pkg.adsPerDay}/يوم) — توقف الرفع بالجملة عند ${created}. هل ترغب بالترقية إلى باقة أفضل؟`, '/packages');
  }
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/store');
  redirect(`/store?bulk=${created}${truncatedByLimit ? '&bulklimit=1' : ''}`);
}


/** شراء «عرض المتجر في تربح» لمدة محددة — يُخصم من الرصيد ويمدَّد التاريخ الحالي. */
export async function buyStoreShowAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  const { getTrbhhShowPricing, isDur, DUR_DAYS, DUR_LABEL } = await import('@/lib/settings');
  const dur = String(formData.get('duration') || '');
  if (!isDur(dur)) redirect('/store?show=err');
  const pricing = await getTrbhhShowPricing();
  const price = pricing.store[dur];
  if (price <= 0) redirect('/store?show=err');
  const { charge } = await import('@/lib/wallet');
  const paid = await charge(session.uid, price, 'store_show', `عرض المتجر في تربح — ${DUR_LABEL[dur]}`);
  if (!paid.ok) redirect(`/store?show=needcredit&price=${price}`);
  const st = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { show_until: true } }).catch(() => null);
  const base = st?.show_until && st.show_until > new Date() ? st.show_until : new Date();
  const until = new Date(base.getTime() + DUR_DAYS[dur] * 24 * 60 * 60 * 1000);
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { show_on_platform: 1, show_until: until } }).catch(() => {});
  revalidatePath('/store');
  revalidatePath('/');
  redirect('/store?show=1');
}

/** شراء «عرض إعلان المتجر في تربح» بباقة (المدة والسعر من التحكم) — يُخصم من الرصيد. */
export async function buyAdShowAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser, storeProductAdIds } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  const adId = Number(formData.get('adId') || 0);
  const pkgKey = String(formData.get('pkg') || '');
  const { getTrbhhShowPricing } = await import('@/lib/settings');
  const pricing = await getTrbhhShowPricing();
  const pkg = pricing.ads.find((x) => x.key === pkgKey && x.price > 0);
  if (!adId || !pkg) redirect('/store?adshow=err');
  // الإعلان لصاحب المتجر ومن منتجات متجره
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { user_id: true, trbhh_until: true, title: true } }).catch(() => null);
  const productIds = await storeProductAdIds(storeId).catch(() => [] as number[]);
  if (!ad || toInt(ad.user_id) !== session.uid || !productIds.includes(adId)) redirect('/store?adshow=err');
  const { charge } = await import('@/lib/wallet');
  const paid = await charge(session.uid, pkg.price, 'ad_show', `${pkg.label} (${pkg.days} يوماً) #${adId} — ${String(ad.title || '').slice(0, 40)}`);
  if (!paid.ok) redirect(`/store?adshow=needcredit&price=${pkg.price}`);
  const base = ad.trbhh_until && ad.trbhh_until > new Date() ? ad.trbhh_until : new Date();
  const until = new Date(base.getTime() + pkg.days * 24 * 60 * 60 * 1000);
  await prisma.ads.updateMany({ where: { id: BigInt(adId) }, data: { trbhh_until: until } }).catch(() => {});
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/store');
  redirect('/store?adshow=1');
}

/** كوبونات المتجر: إضافة كوبون (رمز + وصف الخصم + انتهاء اختياري) — حتى ٢٠ كوبوناً. */
export async function addStoreCouponAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  const { couponsEnabled, addStoreCoupon } = await import('@/lib/store-extras');
  if (!(await couponsEnabled())) redirect('/store');
  const code = String(formData.get('code') || '');
  const discount = String(formData.get('discount') || '');
  const expRaw = String(formData.get('expires') || '').trim();
  const exp = expRaw ? new Date(expRaw) : null;
  const ok = await addStoreCoupon(storeId, code, discount, exp && !isNaN(exp.getTime()) ? exp : null);
  revalidatePath('/store');
  redirect(ok ? '/store?coupon=1' : '/store?coupon=err');
}

export async function deleteStoreCouponAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  const { deleteStoreCoupon } = await import('@/lib/store-extras');
  await deleteStoreCoupon(storeId, Number(formData.get('id') || 0));
  revalidatePath('/store');
  redirect('/store?coupon=del');
}

export async function toggleStoreCouponAction(formData: FormData) {
  const session = await requireUser();
  const { storeIdOfUser } = await import('@/lib/merchant');
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) redirect('/store');
  const { toggleStoreCoupon } = await import('@/lib/store-extras');
  await toggleStoreCoupon(storeId, Number(formData.get('id') || 0));
  revalidatePath('/store');
  redirect('/store?coupon=tog');
}

/** التاجر يفعّل/يوقف التجديد التلقائي لاشتراك متجره (يتجدد بآخر خطة مدفوعة). */
export async function toggleAutoRenewAction(formData: FormData) {
  const session = await requireUser();
  const { setAutoRenew } = await import('@/lib/subscription');
  await setAutoRenew(session.uid, formData.get('on') === '1');
  revalidatePath('/store');
  redirect('/store?renew=saved');
}

/** شراء باقة متجر Plus: اشتراك + عرض في تربح + شارة ⭐ — دفعة واحدة من الرصيد. */
export async function buyStorePlusAction(formData: FormData) {
  const session = await requireUser();
  const raw = String(formData.get('plan') || '');
  const plan = raw === 'monthly' || raw === 'sixmo' || raw === 'yearly' ? raw : null;
  if (!plan) redirect('/store?plus=err');
  const { buyStorePlus } = await import('@/lib/subscription');
  const r = await buyStorePlus(session.uid, plan);
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/store');
  revalidatePath('/');
  if (!r.ok) redirect(r.error === 'الرصيد غير كافٍ.' ? '/store?plus=needcredit' : '/store?plus=err');
  redirect('/store?plus=1');
}

/** إضافة موظف للمتجر برقم جواله (عضو مسجّل) — بحد أقصى من الإعدادات. */
export async function addStoreStaffAction(formData: FormData) {
  const session = await requireUser();
  const { staffEnabled } = await import('@/lib/settings');
  if (!(await staffEnabled())) redirect('/store');
  const { addStoreStaffByPhone } = await import('@/lib/merchant');
  const r = await addStoreStaffByPhone(session.uid, String(formData.get('phone') || ''));
  revalidatePath('/store');
  redirect(r.ok ? '/store?staff=1' : `/store?staff=${r.error || 'err'}`);
}

/** إزالة موظف من المتجر. */
export async function removeStoreStaffAction(formData: FormData) {
  const session = await requireUser();
  const { removeStoreStaff } = await import('@/lib/merchant');
  await removeStoreStaff(session.uid, Number(formData.get('userId') || 0));
  revalidatePath('/store');
  redirect('/store?staff=removed');
}

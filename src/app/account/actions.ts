'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getMemberWindows, withinWindow, getServicePricing, DUR_DAYS, DUR_LABEL, DUP_PACK_COUNT, isDur, getAdRestoreFee } from '@/lib/settings';
import { charge, buyDupPack } from '@/lib/wallet';
import { setUserArea } from '@/lib/user-location';
import { toLocalSaudi } from '@/lib/sms';
import { respondToReport } from '@/lib/alerts';
import { setInterests } from '@/lib/interests';
import { toInt } from '@/lib/utils';

export async function respondToReportAction(formData: FormData) {
  const session = await requireUser();
  const reportId = Number(formData.get('reportId') || 0);
  const text = String(formData.get('response') || '').trim();
  if (reportId && text) await respondToReport(session.uid, reportId, text);
  revalidatePath('/account/reports');
}

export async function setInterestsAction(formData: FormData) {
  const session = await requireUser();
  const ids = formData.getAll('categoryId').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  await setInterests(session.uid, ids);
  revalidatePath('/account');
  revalidatePath('/');
}

export async function deleteAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (ad && toInt(ad.user_id) === session.uid) {
    const { deleteHours } = await getMemberWindows();
    if (!withinWindow(ad.created_at, deleteHours)) {
      redirect(`/account/ads?error=deleteWindow&hours=${deleteHours}`);
    }
    await prisma.photos.deleteMany({ where: { other_id: adId } });
    await prisma.ads.delete({ where: { id: adId } });
  }
  revalidatePath('/account/ads');
}

export async function toggleAdStatusAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (ad && toInt(ad.user_id) === session.uid) {
    // إعلان أخفته الإدارة لمخالفة (arc_msg مضبوط وهو موقوف): لا يعيد العضو نشره
    // بنفسه — يعالج السبب ويعيده للإدارة أو يعتذر؛ الإدارة وحدها تعيد نشره.
    if (ad.status === 0 && ad.arc_msg && ad.arc_msg.trim() !== '') {
      redirect('/account/ads?error=adminhidden');
    }
    // الإيقاف من العضو يُعلَّم paused_by_owner حتى لا يختلط بطلبات الموافقة عند الإدارة
    const pausing = ad.status === 1;
    await prisma.ads.update({ where: { id: adId }, data: { status: pausing ? 0 : 1, paused_by_owner: pausing ? 1 : 0 } });
    const { bustAdCaches } = await import('@/lib/data');
    await bustAdCaches().catch(() => {}); // يظهر/يختفي فوراً في القوائم
  }
  revalidatePath('/account/ads');
  revalidatePath('/');
}

/** إعادة إظهار إعلان مؤرشف (تلقائياً بعد المدة أو من الإدارة) بخصم رسوم من
 *  الرصيد. إعلان أخفته الإدارة لمخالفة (arc_msg) لا يُعاد بالدفع. */
export async function restoreArchivedAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId') || '0'));
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { user_id: true, data_archive: true, arc_msg: true } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');
  // مخالفة أخفتها الإدارة: لا تُعاد بالدفع — تُعالج ويُراسَل بها الإدارة
  if (ad.arc_msg && ad.arc_msg.trim() !== '') redirect('/account/ads?error=adminhidden');
  const isArchived = !!(ad.data_archive && ad.data_archive.trim() !== '');
  if (!isArchived) redirect('/account/ads');
  const fee = await getAdRestoreFee().catch(() => 0);
  if (fee > 0) {
    const paid = await charge(session.uid, fee, 'ad_show', `إعادة إظهار إعلان مؤرشف #${toInt(adId)}`);
    if (!paid.ok) redirect(`/account/ads?error=needcredit&price=${fee}&bal=${paid.balance}`);
  }
  await prisma.ads.update({ where: { id: adId }, data: { status: 1, data_archive: null, bumped_at: new Date() } }).catch(() => {});
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/account/ads');
  revalidatePath('/');
  redirect('/account/ads?restored=1');
}

/** Buy a duplicate-publish package («مكرّر 3» / «مكرّر 5») for a chosen duration. */
export async function buyDupPackAction(formData: FormData) {
  const session = await requireUser();
  const tier = String(formData.get('tier') || '');
  const raw = String(formData.get('duration') || '');
  if (!isDur(raw)) redirect('/account/wallet?error=duration');
  const svc = tier === '5' ? 'dup5' : tier === '3' ? 'dup3' : null;
  if (!svc) redirect('/account/wallet');
  const price = (await getServicePricing())[svc][raw];
  if (price <= 0) redirect('/account/wallet');
  const r = await buyDupPack(session.uid, DUP_PACK_COUNT[svc], price);
  revalidatePath('/account/wallet');
  if (!r.ok) redirect(`/account/wallet?error=needcredit&price=${price}&bal=${r.balance}`);
  redirect('/account/wallet?dup=1');
}

/** طلب شحن رصيد: المبلغ + إيصال التحويل — يُضاف للرصيد بعد تأكيد الإدارة وصول المبلغ. */
export async function requestTopupAction(formData: FormData) {
  const session = await requireUser();
  const amount = Math.round(Number(formData.get('amount') || 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) redirect('/account/wallet?error=topupamount');
  const file = formData.get('receipt');
  if (!(file instanceof File) || file.size === 0) redirect('/account/wallet?error=topupreceipt');
  if (file.size > 8 * 1024 * 1024) redirect('/account/wallet?error=topupreceipt');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const buf = Buffer.from(await file.arrayBuffer());
  // بصمة الإيصال (aHash) — لكشف السند المكرر
  const receiptHash = await import('@/lib/phash').then((m) => m.aHash(buf)).catch(() => '');
  // سند مكرر: لا يُقبل ولا يُرسَل — قد يكون هناك سند بنفس الإيصال تحت المراجعة.
  // نرفض الطلب ونعرض رسالة + زر «مراسلة الإدارة للضرورة» (لا نحفظ الملف أصلاً).
  if (receiptHash) {
    const { matchReceiptHash } = await import('@/lib/wallet');
    const pct = await matchReceiptHash(receiptHash).catch(() => 0);
    if (pct > 0) redirect(`/account/wallet?error=dupreceipt&dupr=${pct}#topup`);
  }
  const { saveUpload } = await import('@/lib/storage');
  const rel = await saveUpload(buf, `topup_${session.uid}_${Date.now()}.${ext}`);
  const { requestTopup } = await import('@/lib/wallet');
  const ok = await requestTopup(session.uid, amount, rel, receiptHash);
  revalidatePath('/account/wallet');
  redirect(ok ? '/account/wallet?topup=1' : '/account/wallet?error=topup');
}

/** Pay from wallet to feature («تمييز») one of the member's own ads for a chosen duration.
 *  back=ad: الزر من صفحة الإعلان نفسها فيعود إليها بنتيجة الشراء. */
export async function featureAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const back = String(formData.get('back') || '') === 'ad' ? `/ads/${toInt(adId)}` : '';
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { id: true, user_id: true, expires_at: true } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');
  const raw = String(formData.get('duration') || '');
  if (!isDur(raw)) redirect(back || '/account/ads?error=duration');
  const fee = (await getServicePricing()).featured[raw];
  if (fee <= 0) redirect(back || '/account/ads?featured=off'); // التمييز غير مُسعّر لهذه المدّة
  const paid = await charge(session.uid, fee, 'featured', `تمييز الإعلان #${toInt(adId)} (${DUR_LABEL[raw]})`);
  if (!paid.ok) redirect(back ? `${back}?featuredneed=1#paid-result` : `/account/ads?error=needcredit&price=${fee}&bal=${paid.balance}`);
  // مدّة التمييز تُضاف إلى ما تبقّى من تمييز سابق (expires_at = نهاية التمييز)
  const base = ad.expires_at && new Date(ad.expires_at).getTime() > Date.now() ? new Date(ad.expires_at) : new Date();
  const until = new Date(base.getTime() + DUR_DAYS[raw] * 86400000);
  await prisma.ads.update({ where: { id: adId }, data: { adsSpecial: 'checked', expires_at: until } });
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/account/ads');
  revalidatePath('/');
  if (back) { revalidatePath(back); redirect(`${back}?featured=1#paid-result`); }
  redirect('/account/ads?featured=1');
}

export async function updateProfileAction(_prev: unknown, formData: FormData) {
  const session = await requireUser();
  // قفل الاسم: عند تفعيله لا يتغيّر الاسم من هنا إطلاقاً — عبر «طلب تغيير الاسم» فقط
  const { nameLockEnabled } = await import('@/lib/settings');
  const nameLocked = await nameLockEnabled();
  const name = String(formData.get('name') || '').trim();
  if (!nameLocked) {
    // الأسماء المخالفة (كلمات/جمل مرفوضة) لا تُقبل إلا من الإدارة
    const { containsBannedName } = await import('@/lib/censor');
    if (await containsBannedName(name)) {
      return { error: 'الاسم يحتوي كلمة غير مسموحة — اختر اسماً آخر.' };
    }
  }
  const phoneRaw = String(formData.get('phoneNumber') || '').trim();
  const waRaw = String(formData.get('phone_whatsapp') || '').trim();
  const phoneNumber = phoneRaw ? toLocalSaudi(phoneRaw) : phoneRaw; // canonical 05XXXXXXXX
  const phone_whatsapp = waRaw ? toLocalSaudi(waRaw) : waRaw;
  const allow_phone = formData.get('allow_phone') ? 1 : 0;
  const whatsapp = formData.get('whatsapp') ? 1 : 0;
  const cityId = Number(formData.get('city_id')) || 0; // المنطقة
  const areaId = Number(formData.get('area_id')) || 0; // المدينة / المحافظة
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: { ...(nameLocked ? {} : { name }), phoneNumber, phone_whatsapp, allow_phone, whatsapp, ...(cityId ? { city_id: BigInt(cityId) } : {}) },
  });
  await setUserArea(session.uid, areaId || null);
  revalidatePath('/account/profile');
  return { ok: true };
}

/** طلب تغيير اسم العضو: لا يتغيّر الاسم إلا بموافقة الإدارة — مع السبب ومستند إثبات. */
export async function requestNameChangeAction(formData: FormData) {
  const session = await requireUser();
  const { nameLockEnabled } = await import('@/lib/settings');
  if (!(await nameLockEnabled())) redirect('/account/profile');
  const newName = String(formData.get('newName') || '').trim().slice(0, 100);
  const reason = String(formData.get('reason') || '').trim().slice(0, 1000);
  const u = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { name: true, userName: true } });
  const oldName = u?.name || u?.userName || '';
  if (!newName || newName === oldName) redirect('/account/profile?namereq=err');
  const { containsBannedName } = await import('@/lib/censor');
  if (await containsBannedName(newName)) redirect('/account/profile?namereq=banned');
  if (!reason) redirect('/account/profile?namereq=reason');
  // طلب واحد معلّق لكل عضو
  const pending = await prisma.name_requests.findFirst({ where: { user_id: BigInt(session.uid), status: 0 } }).catch(() => null);
  if (pending) redirect('/account/profile?namereq=dup');
  // المستند إلزامي: صورة أو PDF يثبت الاسم الجديد
  const file = formData.get('doc');
  let docId = 0;
  if (file instanceof File && file.size > 0) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    const { saveUpload } = await import('@/lib/storage');
    const rel = await saveUpload(buf, `namechg_${session.uid}_${Date.now()}.${ext}`);
    const up = await prisma.uploads.create({ data: { file_name: rel, extension: ext, type: 'name_change', file_size: file.size, user_id: session.uid } });
    docId = toInt(up.id);
  }
  if (!docId) redirect('/account/profile?namereq=doc');
  await prisma.name_requests.create({ data: { user_id: BigInt(session.uid), old_name: oldName, new_name: newName, reason, doc: docId } });
  revalidatePath('/account/profile');
  redirect('/account/profile?namereq=1');
}

export async function toggleFavoriteAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const existing = await prisma.favorites.findFirst({ where: { user_id: BigInt(session.uid), ads_id: adId } });
  if (existing) await prisma.favorites.delete({ where: { id: existing.id } });
  else await prisma.favorites.create({ data: { user_id: BigInt(session.uid), ads_id: adId } });
  revalidatePath(`/ads/${toInt(adId)}`);
  revalidatePath('/account/favorites');
}


/** شراء شارة «عاجل» 🔥 لإعلان العضو — السعر والمدة من التحكم، يُخصم من الرصيد.
 *  back=ad: الزر من صفحة الإعلان نفسها فيعود إليها بنتيجة الشراء. */
export async function buyUrgentAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId') || '0'));
  const back = String(formData.get('back') || '') === 'ad' ? `/ads/${toInt(adId)}` : '';
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { user_id: true, urgent_until: true } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');
  // منع تكرار الدفع: شارة «عاجل» فعّالة الآن — لا نخصم مرة أخرى حتى تنتهي مدّتها
  if (ad.urgent_until && ad.urgent_until > new Date()) redirect(back ? `${back}?urgenton=1#paid-result` : '/account/ads?urgenton=1');
  const { getAdExtras } = await import('@/lib/settings');
  const x = await getAdExtras();
  // باقتا عاجل: 24 أو 48 ساعة — لكل باقة سعرها من التحكم
  const hours = Number(formData.get('hours') || 0);
  const pack = x.urgentPacks.find((pk) => pk.hours === hours) ?? x.urgentPacks[0];
  if (!pack) redirect(back || '/account/ads');
  const paid = await charge(session.uid, pack.price, 'urgent', `شارة عاجل (${pack.hours} ساعة) #${toInt(adId)}`);
  if (!paid.ok) redirect(back ? `${back}?urgentneed=1#paid-result` : `/account/ads?error=needcredit&price=${pack.price}&bal=${paid.balance}`);
  const base = ad.urgent_until && ad.urgent_until > new Date() ? ad.urgent_until : new Date();
  await prisma.ads.update({ where: { id: adId }, data: { urgent_until: new Date(base.getTime() + pack.hours * 3600_000) } }).catch(() => {});
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/account/ads');
  if (back) revalidatePath(back);
  redirect(back ? `${back}?urgent=1#paid-result` : '/account/ads?urgent=1');
}

/** «تحديث إعلاني»: رفع الإعلان لأعلى القوائم — مجاني كل X أيام، وما زاد يُخصم من الرصيد. */
export async function bumpAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId') || '0'));
  // back=ad: الزر من صفحة الإعلان نفسها فيعود إليها بنتيجة التحديث
  const back = String(formData.get('back') || '') === 'ad' ? `/ads/${toInt(adId)}` : '';
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { user_id: true, status: true, bumped_at: true, created_at: true } });
  if (!ad || toInt(ad.user_id) !== session.uid || ad.status !== 1) redirect('/account/ads');
  // منع تكرار الدفع بالخطأ: حُدّث الإعلان للتو (خلال دقيقتين) — نعيد رسالة النجاح بلا خصم جديد
  if (ad.bumped_at && (Date.now() - ad.bumped_at.getTime()) < 120_000) redirect(back ? `${back}?bumped=1#paid-result` : '/account/ads?bumped=1');
  const [{ getAdExtras, getSettingBool }] = await Promise.all([import('@/lib/settings')]);
  if (!(await getSettingBool('bump_on', false))) redirect(back || '/account/ads');
  const x = await getAdExtras();
  const last = ad.bumped_at || ad.created_at || new Date(0);
  const daysSince = (Date.now() - last.getTime()) / 86400_000;
  const freeOk = x.bumpFreeDays > 0 && daysSince >= x.bumpFreeDays;
  if (!freeOk) {
    if (x.bumpPrice <= 0) {
      const left = Math.max(1, Math.ceil(x.bumpFreeDays - daysSince));
      redirect(back ? `${back}?bumpwait=${left}#paid-result` : `/account/ads?bumpwait=${left}`);
    }
    const paid = await charge(session.uid, x.bumpPrice, 'bump', `تحديث إعلان (رفع للأعلى) #${toInt(adId)}`);
    if (!paid.ok) redirect(back ? `${back}?bumpneed=1#paid-result` : `/account/ads?error=needcredit&price=${x.bumpPrice}&bal=${paid.balance}`);
  }
  await prisma.ads.update({ where: { id: adId }, data: { bumped_at: new Date() } }).catch(() => {});
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/account/ads');
  if (back) { revalidatePath(back); redirect(`${back}?bumped=1#paid-result`); }
  redirect('/account/ads?bumped=1');
}


/** التبديل إلى حساب آخر مرتبط بنفس المالك (من دخول واحد) — يتحقّق خادمياً أن
 *  الحساب الهدف في نفس مجموعة الربط قبل إصدار جلسة له. لا كلمة مرور لأن
 *  الإدارة وثّقت أنهما لنفس الشخص عبر «ربط الأعضاء». */
export async function switchAccountAction(formData: FormData) {
  const session = await requireUser();
  const target = Number(formData.get('userId') || 0);
  const confirmed = formData.get('confirmed') === '1';
  if (!target || target === session.uid) redirect('/account');
  const { linkedUserIds, getLinkMode } = await import('@/lib/account-links');
  const linked = await linkedUserIds(session.uid).catch(() => [session.uid]);
  if (!linked.includes(target)) redirect('/account?error=notlinked');
  const u = await prisma.users.findUnique({ where: { id: BigInt(target) }, select: { id: true, name: true, userName: true, ban: true } }).catch(() => null);
  if (!u) redirect('/account');
  if (u.ban === 'checked') redirect('/account?error=switchbanned');
  // أمان: لا يُسمح بالتبديل بلا كلمة مرور إلى حساب له صلاحيات إدارة — يجب الدخول
  // إليه بكلمة مروره مباشرةً (يمنع تصعيد الصلاحية عبر مجموعة ربط تضمّ حساب إدارة).
  const { hasAnyAdmin } = await import('@/lib/roles');
  if (await hasAnyAdmin(target).catch(() => false)) redirect('/account?error=switchadmin');
  // «ذكّرني قبل أي إجراء»: يمرّ بصفحة تأكيد قبل التبديل ما لم يكن مباشراً أو مؤكّداً
  if (!confirmed) {
    const mode = await getLinkMode(target).catch(() => 'confirm' as const);
    if (mode === 'confirm') redirect(`/account/switch?to=${target}`);
  }
  const { createSession } = await import('@/lib/auth');
  await createSession({ uid: toInt(u.id), name: u.name || u.userName || 'مستخدم', type: 'user' });
  redirect('/account?switched=1');
}

/** ربط ذاتي لحساب آخر يملكه العضو — يثبت ملكيته باسم الدخول وكلمة المرور. */
export async function linkOwnAccountAction(formData: FormData) {
  const session = await requireUser();
  const identifier = String(formData.get('identifier') || '');
  const password = String(formData.get('password') || '');
  if (!identifier || !password) redirect('/account/identities?error=empty');
  const { verifyAndLinkOwn } = await import('@/lib/account-links');
  const res = await verifyAndLinkOwn(session.uid, identifier, password).catch(() => ({ ok: false as const, error: 'تعذّر الربط' }));
  revalidatePath('/account/identities');
  if (!res.ok) redirect(`/account/identities?error=link&msg=${encodeURIComponent(res.error || 'تعذّر الربط')}`);
  redirect(`/account/identities?linked=${encodeURIComponent(res.name || 'الحساب')}`);
}

/** ضبط تفضيل التبديل لحساب مرتبط: مباشر أو تأكيد قبل الإجراء. */
export async function setLinkModeAction(formData: FormData) {
  const session = await requireUser();
  const target = Number(formData.get('userId') || 0);
  const mode = formData.get('mode') === 'direct' ? 'direct' : 'confirm';
  if (target) {
    const { setLinkMode } = await import('@/lib/account-links');
    await setLinkMode(session.uid, target, mode).catch(() => {});
  }
  revalidatePath('/account/identities');
  redirect('/account/identities?saved=1');
}

/** فك ارتباط حساب من مجموعة العضو (يجب أن يكون ضمن مجموعته). */
export async function unlinkOwnAccountAction(formData: FormData) {
  const session = await requireUser();
  const target = Number(formData.get('userId') || 0);
  const { linkedUserIds, unlinkAccount } = await import('@/lib/account-links');
  const linked = await linkedUserIds(session.uid).catch(() => [session.uid]);
  if (target && linked.includes(target)) await unlinkAccount(target).catch(() => {});
  revalidatePath('/account/identities');
  redirect('/account/identities?unlinked=1');
}

/** تحويل نقاط العضو إلى رصيد — بالمعدل والحد الأدنى المحددين من التحكم. */
export async function convertPointsAction() {
  const session = await requireUser();
  const { convertPoints } = await import('@/lib/points');
  const r = await convertPoints(session.uid);
  revalidatePath('/account/wallet');
  redirect(r.ok ? `/account/wallet?pts=${r.sar}` : '/account/wallet?error=pts');
}

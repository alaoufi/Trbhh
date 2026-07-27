'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAction, requireUserBan, requireManager, setUserPerms, applyRolePreset, ALL_KEYS, setRolePermKeys, MATRIX_ROLES, type Role } from '@/lib/roles';
import { findDuplicateAds, findCrossUserDuplicateAds } from '@/lib/duplicates';
import { deleteClassified, setClassifiedStatus, setClassifiedLifetime } from '@/lib/classified';
import { adminDeleteMessage } from '@/lib/chat';
import { setStoreStatus, adminRequestHome, addStoreWarning, deleteStore, completeStoreTransfer, decidePlatformRequest } from '@/lib/merchant';
import { banUserFor, unbanUser, logMod, notifyModBlock, reviewAutoBan } from '@/lib/moderation';
import { listDeletionRequests, closeDeletionRequest, findUserByPhone, deleteAccountNow } from '@/lib/account-delete';
import { addBannedWord, deleteBannedWord, addNameWord, deleteNameWord } from '@/lib/censor';
import { addGuardWord, deleteGuardWord, GUARD_CATEGORIES, type GuardCategory } from '@/lib/content-guard';
import { createPackage, updatePackage, deletePackage, assignUserPackage, type Tier } from '@/lib/packages';
import { setSetting, SETTING_AD_EDIT_HOURS, SETTING_AD_DELETE_HOURS, SETTING_MSG_DELETE_MINUTES, SETTING_HOME_STATS, HOME_STAT_KEYS, SETTING_CLASSIFIED_STATS, SETTING_CLASSIFIED_DAYS, SETTING_CLASSIFIED_SECONDS, SETTING_ADS_APPROVAL, SETTING_DUP_TITLE_PCT, SETTING_DUP_DETAIL_PCT, SETTING_DUP_IMAGE_PCT, SETTING_STRIKE_BAN_DAYS, getStrikeBanDays, SETTING_CDUP_ON, SETTING_CDUP_CONTENT_PCT, SETTING_CDUP_IMAGE_PCT, SETTING_CDUP_BG_PCT, SETTING_MSG_TPL_AD, SETTING_MSG_TPL_ADMIN, SETTING_AD_NOTICE, SETTING_TICKER, SETTING_SITE_SHARE_TITLE, SETTING_SITE_SHARE_DESC, SETTING_WELCOME_GUEST_TEXT, SETTING_WELCOME_MEMBER_TEXT, SETTING_WELCOME_POPUP_SECONDS, SETTING_HOME_CLS_TITLE, SETTING_HOME_CLS_SUB, SETTING_HOME_H_STORES, SETTING_HOME_H_PRODUCTS, SETTING_HOME_H_FEATURED, SETTING_HOME_H_LATEST, SETTING_HOME_H_MOSTVIEWED, SETTING_EMPTY_ADS, SETTING_EMPTY_CHATS, SETTING_EMPTY_STORES, SETTING_EMPTY_REVIEWS, SETTING_EMPTY_CLASSIFIED, SETTING_MSG_VERIFY_OK, SETTING_MSG_VERIFY_REJECT, SETTING_TOPUP_INFO, SETTING_MSG_TOPUP_OK, SETTING_MSG_TOPUP_REJECT, SETTING_MSG_TOPUP_CANCEL, SETTING_TOPUP_NAME_NOTE, getTopupAccounts, setTopupAccounts, SETTING_SUB_ENABLED, SETTING_SUB_MONTHLY, SETTING_SUB_6MO, SETTING_SUB_YEARLY, SETTING_SUB_GRACE_DAYS, SETTING_SUB_TRIAL_DAYS, SETTING_SUB_REMIND_DAYS, SETTING_SUB_REMIND_COUNT, SETTING_SUB_REMINDER_MSG, SETTING_SHOW_REMINDER_MSG, SETTING_ADSHOW_REMINDER_MSG, servicePriceKey, DURATIONS, type PaidService, APP_KEYS } from '@/lib/settings';
import { approvePromo, rejectPromo, deletePromo, createPromoPackage, updatePromoPackage, deletePromoPackage } from '@/lib/promos';
import { createBackup, restoreBackup, deleteBackup } from '@/lib/backup';
import { MSG_KEYS, toLocalSaudi, sendNewPasswordToUser } from '@/lib/sms';
import { hashPassword } from '@/lib/auth';
import { bustAdCaches } from '@/lib/data';
import { toInt } from '@/lib/utils';
import { logAdmin } from '@/lib/audit';

function readPromoPkgForm(formData: FormData) {
  return {
    name: String(formData.get('name') || '').trim() || 'باقة',
    days: Math.max(1, parseInt(String(formData.get('days') || '30')) || 30),
    price: Math.max(0, parseFloat(String(formData.get('price') || '0')) || 0),
    sort: parseInt(String(formData.get('sort') || '0')) || 0,
    active: formData.get('active') !== null,
  };
}

export async function approvePromoAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await approvePromo(id);
  revalidatePath('/admin/promos');
}
export async function rejectPromoAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await rejectPromo(id);
  revalidatePath('/admin/promos');
}
export async function deletePromoAction(formData: FormData) {
  await requireAction('promos', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePromo(id);
  revalidatePath('/admin/promos');
}
export async function createPromoPackageAction(formData: FormData) {
  await requireAction('promos', 'add');
  await createPromoPackage(readPromoPkgForm(formData));
  revalidatePath('/admin/revenue');
  revalidatePath('/promote');
}
export async function updatePromoPackageAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await updatePromoPackage(id, readPromoPkgForm(formData));
  revalidatePath('/admin/revenue');
  revalidatePath('/promote');
}
export async function deletePromoPackageAction(formData: FormData) {
  await requireAction('promos', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePromoPackage(id);
  revalidatePath('/admin/revenue');
  revalidatePath('/promote');
}

function readPackageForm(formData: FormData) {
  const t = String(formData.get('tier') || '');
  return {
    name: String(formData.get('name') || '').trim() || 'باقة',
    price: Math.max(0, parseFloat(String(formData.get('price') || '0')) || 0),
    adsPerDay: Math.max(0, parseInt(String(formData.get('adsPerDay') || '0')) || 0),
    gapHours: Math.max(0, parseInt(String(formData.get('gapHours') || '0')) || 0),
    featuredSlots: Math.max(0, parseInt(String(formData.get('featuredSlots') || '0')) || 0),
    featuredDays: Math.max(0, parseInt(String(formData.get('featuredDays') || '0')) || 0),
    adDays: Math.max(0, parseInt(String(formData.get('adDays') || '0')) || 0),
    tier: (t === 'gold' || t === 'silver' ? t : '') as Tier,
    isDefault: !!formData.get('isDefault'),
    sort: parseInt(String(formData.get('sort') || '0')) || 0,
    active: formData.get('active') !== null,
  };
}

export async function createPackageAction(formData: FormData) {
  await requireAction('packages', 'add');
  await createPackage(readPackageForm(formData));
  revalidatePath('/admin/revenue');
  revalidatePath('/packages');
}

export async function updatePackageAction(formData: FormData) {
  await requireAction('packages', 'edit');
  const id = Number(formData.get('id'));
  if (id) await updatePackage(id, readPackageForm(formData));
  revalidatePath('/admin/revenue');
  revalidatePath('/packages');
}

export async function deletePackageAction(formData: FormData) {
  await requireAction('packages', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePackage(id);
  revalidatePath('/admin/revenue');
  revalidatePath('/packages');
}

export async function assignUserPackageAction(formData: FormData) {
  await requireAction('packages', 'edit');
  const userId = Number(formData.get('userId'));
  const packageId = Number(formData.get('packageId')) || 0;
  const days = parseInt(String(formData.get('days') || '0')) || 0;
  if (userId) await assignUserPackage(userId, packageId, days);
  revalidatePath('/admin/users');
}

export async function addBannedWordAction(formData: FormData) {
  await requireAction('words', 'add');
  const word = String(formData.get('word') || '').trim();
  if (word) await addBannedWord(word);
  revalidatePath('/admin/words');
}

export async function deleteBannedWordAction(formData: FormData) {
  await requireAction('words', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteBannedWord(id);
  revalidatePath('/admin/words');
}

export async function addNameWordAction(formData: FormData) {
  await requireAction('words', 'add');
  const word = String(formData.get('word') || '').trim();
  if (word) await addNameWord(word);
  revalidatePath('/admin/words');
}

export async function deleteNameWordAction(formData: FormData) {
  await requireAction('words', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteNameWord(id);
  revalidatePath('/admin/words');
}

export async function addGuardWordAction(formData: FormData) {
  await requireAction('words', 'add');
  const category = String(formData.get('category') || '') as GuardCategory;
  const word = String(formData.get('word') || '').trim();
  if (word && GUARD_CATEGORIES.includes(category)) await addGuardWord(category, word);
  revalidatePath('/admin/guard-words');
}

export async function deleteGuardWordAction(formData: FormData) {
  await requireAction('words', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteGuardWord(id);
  revalidatePath('/admin/guard-words');
}

export async function addAllowedPhraseAction(formData: FormData) {
  await requireAction('words', 'add');
  const phrase = String(formData.get('phrase') || '').trim();
  if (phrase) { const { addAllowedPhrase } = await import('@/lib/content-guard'); await addAllowedPhrase(phrase); }
  revalidatePath('/admin/guard-words');
}

export async function deleteAllowedPhraseAction(formData: FormData) {
  await requireAction('words', 'delete');
  const id = Number(formData.get('id'));
  if (id) { const { deleteAllowedPhrase } = await import('@/lib/content-guard'); await deleteAllowedPhrase(id); }
  revalidatePath('/admin/guard-words');
}

/** Enable/disable a classified ad (hidden from the site while disabled). */
export async function toggleClassifiedAction(formData: FormData) {
  await requireAction('classified', 'suspend');
  const id = Number(formData.get('id'));
  const enable = String(formData.get('action')) === 'enable';
  if (id) await setClassifiedStatus(id, enable);
  revalidatePath('/admin/classified');
  revalidatePath('/classified');
}

/** Set a classified ad's lifetime in days from now (0 = follow the global setting). */
export async function classifiedLifetimeAction(formData: FormData) {
  await requireAction('classified', 'edit');
  const id = Number(formData.get('id'));
  const days = Math.max(0, parseInt(String(formData.get('days') || '0')) || 0);
  if (id) await setClassifiedLifetime(id, days);
  revalidatePath('/admin/classified');
  revalidatePath('/classified');
}

export async function adminDeleteClassifiedAction(formData: FormData) {
  await requireAction('classified', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteClassified(id);
  revalidatePath('/admin/classified');
  revalidatePath('/classified');
}

/** Approve or reject a merchant store. */
export async function approveStoreAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  const approve = String(formData.get('action')) === 'approve';
  if (id) {
    await setStoreStatus(id, approve ? 1 : 2);
    await logAdmin(session.uid, approve ? 'اعتماد متجر' : 'رفض متجر', `متجر #${id}`);
  }
  revalidatePath('/admin/stores');
}

/** Admin asks an approved store to feature its products on the home page. */
export async function requestStoreHomeAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  if (id) {
    await adminRequestHome(id);
    await logAdmin(session.uid, 'عرض متجر بالرئيسية (قرار إداري)', `متجر #${id}`);
  }
  revalidatePath('/admin/stores');
}

/** Suspend (stop) or reactivate a store. */
export async function toggleStoreStatusAction(formData: FormData) {
  const session = await requireAction('stores', 'suspend');
  const id = Number(formData.get('storeId'));
  const action = String(formData.get('action'));
  if (id) {
    const status = action === 'suspend_perm' ? 3 : action === 'suspend' ? 2 : 1;
    await setStoreStatus(id, status);
    const label = status === 3 ? 'إيقاف نهائي لمتجر' : status === 2 ? 'إيقاف مؤقت لمتجر' : 'إعادة تفعيل متجر';
    await logAdmin(session.uid, label, `متجر #${id}`);
  }
  revalidatePath('/admin/stores');
}

/** Issue a violation warning against a store (3 warnings → auto-suspend). */
export async function warnStoreAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  const reason = String(formData.get('reason') || '').trim();
  if (id && reason) {
    await addStoreWarning(id, reason);
    await logAdmin(session.uid, 'إنذار متجر', `متجر #${id}`, reason);
  }
  revalidatePath('/admin/stores');
}

/** حذف نهائي حقيقي — فقط من الأرشيف (متجر موقوف نهائياً بالفعل، أي «حذفه» سابقاً
 *  من لوحة المتاجر عبر «إيقاف نهائي» = toggleStoreStatusAction)، ولا رجعة فيه. */
export async function adminDeleteStoreForeverAction(formData: FormData) {
  const session = await requireAction('stores', 'delete');
  const id = Number(formData.get('storeId'));
  if (id && formData.get('confirm')) {
    const s = await prisma.stores.findUnique({ where: { id: BigInt(id) }, select: { status: true, store_name: true } }).catch(() => null);
    if (s?.status === 3) {
      await deleteStore(id);
      await logAdmin(session.uid, 'حذف متجر نهائياً من الأرشيف', `متجر #${id} «${s.store_name || ''}»`);
    }
  }
  revalidatePath('/admin/archive');
}

/** أرشفة تعليق (إخفاء عن الجمهور دون حذفه) — يظهر في تبويب «التعليقات» بالأرشيف. */
export async function adminHideCommentAction(formData: FormData) {
  const session = await requireAction('comments', 'delete');
  const id = Number(formData.get('commentId'));
  const adId = Number(formData.get('adId') || 0);
  if (id) {
    await prisma.comments.updateMany({ where: { id: BigInt(id) }, data: { hide: 'yes' } });
    await logAdmin(session.uid, 'أرشفة تعليق', `تعليق #${id}${adId ? ` · إعلان #${adId}` : ''}`);
  }
  if (adId) revalidatePath(`/ads/${adId}`);
  revalidatePath('/admin/archive');
}

/** استعادة تعليق من الأرشيف. */
export async function adminRestoreCommentAction(formData: FormData) {
  const session = await requireAction('comments', 'delete');
  const id = Number(formData.get('commentId'));
  if (id) {
    await prisma.comments.updateMany({ where: { id: BigInt(id) }, data: { hide: 'no' } });
    await logAdmin(session.uid, 'استعادة تعليق من الأرشيف', `تعليق #${id}`);
  }
  revalidatePath('/admin/archive');
}

/** Admin approves/rejects a merchant's request to feature products on Trbhh. */
export async function decidePlatformAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  const approve = String(formData.get('action')) === 'approve';
  if (id) {
    await decidePlatformRequest(id, approve);
    await logAdmin(session.uid, approve ? 'اعتماد عرض منتجات متجر' : 'رفض عرض منتجات متجر', `متجر #${id}`);
  }
  revalidatePath('/admin/stores');
}

/** Admin executes a mutually-consented ownership transfer (step 3). */
export async function completeStoreTransferAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  if (id && formData.get('confirm')) {
    await completeStoreTransfer(id);
    await logAdmin(session.uid, 'تنفيذ نقل ملكية متجر', `متجر #${id}`);
  }
  revalidatePath('/admin/stores');
}

/** Admin removes a single (inappropriate) chat message from a monitored thread. */
export async function adminDeleteMessageAction(formData: FormData) {
  await requireAction('messages', 'delete');
  const id = Number(formData.get('messageId'));
  if (id) await adminDeleteMessage(id);
  revalidatePath('/admin/messages');
}

/** Delete an ad from its detail page (admin), then go home. */
/** لا حذف مباشر: إن لم يكن الإعلان مؤرشفاً يُؤرشف أولاً (ينتقل للأرشيف)،
 *  والحذف النهائي لا يتم إلا على إعلان مؤرشف. */
export async function adminDeleteAdRedirectAction(formData: FormData) {
  const session = await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id }, select: { data_archive: true } }).catch(() => null);
  const isArchived = !!(a?.data_archive && a.data_archive.trim() !== '');
  if (!isArchived) {
    await prisma.ads.update({ where: { id }, data: { status: 0, data_archive: new Date().toISOString() } }).catch(() => {});
    await logAdmin(session.uid, 'أرشفة إعلان (بدل الحذف المباشر)', `إعلان #${toInt(id)}`);
    await bustAdCaches().catch(() => {});
    revalidatePath(`/ads/${toInt(id)}`);
    redirect(`/ads/${toInt(id)}?archived=1`);
  }
  await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  await logAdmin(session.uid, 'حذف إعلان نهائياً من الأرشيف', `إعلان #${toInt(id)}`);
  await bustAdCaches().catch(() => {});
  redirect('/');
}

/** Archive (hide) an ad from its detail page (admin). Auto-deleted after 30 days. */
export async function adminArchiveAdAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) {
    const archiving = a.status === 1;
    await prisma.ads.update({
      where: { id },
      // النشر من الإدارة يمسح علامة «أوقفه صاحبه» أيضاً
      data: { status: archiving ? 0 : 1, data_archive: archiving ? new Date().toISOString() : null, ...(archiving ? {} : { paused_by_owner: 0 }) },
    }).catch(() => {});
  }
  revalidatePath(`/ads/${toInt(id)}`);
}

/** رسالة من الإدارة لصاحب الإعلان (من داخل صفحة الإعلان) — يُضاف رابط الإعلان تلقائياً
 *  آخر الرسالة، وتُرسَل من حساب المشرف الحالي فتصله ردوده في «الرسائل». */
export async function adminMessageAdOwnerAction(formData: FormData) {
  const session = await requireAction('ads', 'archive');
  const adId = Number(formData.get('adId') || 0);
  const text = String(formData.get('message') || '').trim().slice(0, 1000);
  if (!adId || !text) redirect(`/ads/${adId}#admin-tools`);
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { user_id: true, title: true } }).catch(() => null);
  const sellerId = ad ? toInt(ad.user_id) : 0;
  if (!sellerId || sellerId === session.uid) redirect(`/ads/${adId}#admin-tools`);
  const { SITE } = await import('@/lib/constants');
  const { sendChat } = await import('@/lib/chat');
  const body = `${text}\n\nرابط الإعلان: https://${SITE.domain}/ads/${adId}`;
  await sendChat(session.uid, sellerId, body);
  await logAdmin(session.uid, 'رسالة لصاحب إعلان', `إعلان #${adId}${ad?.title ? ` «${ad.title}»` : ''}`, text.slice(0, 120));
  redirect(`/ads/${adId}?adminmsg=1#admin-tools`);
}

/** حظر إعلان مخالف نهائياً: حذف فوري ولا رجعة فيه — يختلف عن «الأرشفة» (مؤقتة وقابلة للاستعادة).
 *  يُستخدم للمحتوى المخالف الواضح؛ يُسجَّل في سجل التجاوزات وسجل نشاط الإدارة. */
export async function adminBanAdAction(formData: FormData) {
  const session = await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  const ad = await prisma.ads.findUnique({ where: { id }, select: { title: true, user_id: true } }).catch(() => null);
  if (ad) {
    await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
    await prisma.ads.delete({ where: { id } }).catch(() => {});
    // action: 'ad_banned' — الإعلان نفسه حُذف نهائياً، لا حساب العضو؛ يختلف عن 'banned' (حظر حساب)
    // فلا يظهر في صندوق «حظر آلي بانتظار المراجعة» (لا يوجد حظر حساب لفكّه أو استمراره).
    await logMod(toInt(ad.user_id), { kind: 'content', category: null, term: null, snippet: `حظر إعلان نهائياً: «${ad.title}»${reason ? ` — السبب: ${reason}` : ''}`, action: 'ad_banned' });
    await logAdmin(session.uid, 'حظر إعلان مخالف نهائياً (حذف لا رجعة فيه)', `إعلان #${toInt(id)} «${ad.title}»${reason ? ` — ${reason}` : ''}`);
    await notifyModBlock(toInt(ad.user_id), `🚫 حُذف إعلانك «${ad.title}» نهائياً لمخالفته لوائح الموقع${reason ? ` — السبب: ${reason}` : ''}. هذا القرار نهائي ولا يمكن التراجع عنه.`, '/account/ads');
  }
  await bustAdCaches().catch(() => {});
  redirect('/');
}

/** إعلان متجر: صلاحية الإدارة محدودة — إخفاؤه عن النشر (يبقى ظاهراً لإدارة
 *  المتجر مع سبب المخالفة) وإرسال إنذار مخالفة لصاحب المتجر (يحتسب ضمن ٣
 *  إنذارات)، أو إعادة نشره. لا أرشفة ولا حذف ولا حظر للمتجر. */
export async function adminHideStoreAdAction(formData: FormData) {
  const session = await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const storeId = Number(formData.get('storeId') || 0);
  const reason = String(formData.get('reason') || '').trim();
  const a = await prisma.ads.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
  if (!a) { revalidatePath(`/ads/${toInt(id)}`); return; }
  if (a.status === 1) {
    // إخفاء عن النشر + تسجيل السبب على الإعلان (يراه صاحب المتجر) + إنذار مخالفة
    await prisma.ads.update({ where: { id }, data: { status: 0, arc_msg: (reason || 'مخفي من الإدارة لمخالفة').slice(0, 225) } }).catch(() => {});
    if (storeId && reason) await addStoreWarning(storeId, reason).catch(() => {});
    await logAdmin(session.uid, 'إخفاء إعلان متجر عن النشر + إنذار مخالفة', `إعلان #${toInt(id)} · متجر #${storeId}`, reason);
  } else {
    // إعادة النشر — يمسح سبب الإخفاء (الإنذار السابق يبقى مسجّلاً على المتجر)
    await prisma.ads.update({ where: { id }, data: { status: 1, arc_msg: null } }).catch(() => {});
    await logAdmin(session.uid, 'إعادة نشر إعلان متجر', `إعلان #${toInt(id)}`);
  }
  await bustAdCaches().catch(() => {});
  revalidatePath(`/ads/${toInt(id)}`);
  revalidatePath('/');
}

/** Ban/unban the seller from the ad detail page (admin). Asks for duration:
 *  `permanent` flag → permanent, else `days` (temporary). If already banned → unban. */
export async function adminBanSellerAction(formData: FormData) {
  await requireUserBan();
  const uid = Number(formData.get('userId'));
  const u = await prisma.users.findUnique({ where: { id: BigInt(uid) } });
  if (u) {
    if (u.ban === 'checked') {
      await unbanUser(uid);
    } else {
      const permanent = !!formData.get('permanent');
      const days = Math.max(0, parseInt(String(formData.get('days') || '0')) || 0);
      await banUserFor(uid, permanent ? 0 : days);
    }
  }
  const adId = String(formData.get('adId') || '');
  if (adId) revalidatePath(`/ads/${adId}`);
}

export async function adminDeleteDuplicatesAction() {
  await requireAction('duplicates', 'delete');
  const { groups } = await findDuplicateAds();
  const dupIds = groups.flatMap((g) => g.dups.map((d) => BigInt(d.id)));
  let deleted = 0;
  for (const id of dupIds) {
    await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
    const ok = await prisma.ads.delete({ where: { id } }).then(() => true).catch(() => false);
    if (ok) deleted++;
  }
  revalidatePath('/admin/ads');
  revalidatePath('/admin/duplicates');
  redirect(`/admin/duplicates?deleted=${deleted}`);
}

/** حذف الإعلانات المكررة عبر أعضاء مختلفين (شبكات سبام بأرقام/حسابات متعددة). */
export async function adminDeleteCrossDuplicatesAction() {
  await requireAction('duplicates', 'delete');
  const { groups } = await findCrossUserDuplicateAds();
  const dupIds = groups.flatMap((g) => g.dups.map((d) => BigInt(d.id)));
  let deleted = 0;
  for (const id of dupIds) {
    await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
    const ok = await prisma.ads.delete({ where: { id } }).then(() => true).catch(() => false);
    if (ok) deleted++;
  }
  revalidatePath('/admin/ads');
  revalidatePath('/admin/duplicates');
  redirect(`/admin/duplicates?crossdeleted=${deleted}`);
}

/** Execute a logged-out account-deletion request (Google Play requirement). */
export async function executeDeletionRequestAction(formData: FormData) {
  await requireAction('users', 'delete');
  const id = Number(formData.get('id'));
  const phone = String(formData.get('phone') || '');
  const uid = await findUserByPhone(phone);
  if (uid) await deleteAccountNow(uid);
  if (id) await closeDeletionRequest(id);
  revalidatePath('/admin/users');
}

/** Dismiss a deletion request without deleting (e.g. ownership not verified). */
export async function dismissDeletionRequestAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = Number(formData.get('id'));
  if (id) await closeDeletionRequest(id);
  revalidatePath('/admin/users');
}

/** Ban a member for a chosen duration (days) or permanently. */
export async function banUserAction(formData: FormData) {
  const session = await requireUserBan();
  const id = Number(formData.get('userId'));
  const permanent = !!formData.get('permanent');
  const days = Math.max(0, parseInt(String(formData.get('days') || '0')) || 0);
  await banUserFor(id, permanent ? 0 : days);
  await logAdmin(session.uid, 'حظر عضو', `العضو #${String(formData.get('userId') || '')}`);
  revalidatePath('/admin/users');
}

/** Lift a member's ban. */
export async function unbanUserAction(formData: FormData) {
  const session = await requireUserBan();
  const id = Number(formData.get('userId'));
  await unbanUser(id);
  await logAdmin(session.uid, 'رفع حظر', `العضو #${String(formData.get('userId') || '')}`);
  revalidatePath('/admin/users');
}

/** Save a user's granular permissions from the permissions matrix (checkboxes named perm[]).
 *  Manager-only: granting permissions must not be doable by an admin who merely
 *  has 'users:edit' (e.g. a limited profile-editing grant) — otherwise they could
 *  hand themselves (or anyone) every permission in the system. */
export async function setUserPermsAction(formData: FormData) {
  await requireManager();
  const id = Number(formData.get('userId'));
  if (!id) redirect('/admin/users');
  const keys = formData.getAll('perm').map((v) => String(v)).filter((k) => ALL_KEYS.includes(k));
  await setUserPerms(id, keys);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${id}/permissions?saved=1`);
}

/** Apply a quick role preset (manager/moderator/monitor/none) to a user. Manager-only — see setUserPermsAction. */
export async function applyPresetAction(formData: FormData) {
  await requireManager();
  const id = Number(formData.get('userId'));
  const role = String(formData.get('role') || 'none') as Role | 'none';
  if (id) await applyRolePreset(id, role);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${id}/permissions?saved=1`);
}

/** Save the member self-service windows (edit/delete allowed period, hours). */
/** النصوص الظاهرة للزائر (تبويب مقسّم لأقسام) — يُحفَظ قسم واحد فقط في كل مرة. */
export async function saveTextsAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const sec = String(formData.get('sec') || 'general');
  const put = async (key: string, name: string) => setSetting(key, String(formData.get(name) ?? '').trim());
  if (sec === 'general') {
    await put(SETTING_TICKER, 'ticker');
    await put(SETTING_SITE_SHARE_TITLE, 'shareTitle');
    await put(SETTING_SITE_SHARE_DESC, 'shareDesc');
  } else if (sec === 'home') {
    await put(SETTING_HOME_CLS_TITLE, 'homeClsTitle');
    await put(SETTING_HOME_CLS_SUB, 'homeClsSub');
    await put(SETTING_HOME_H_STORES, 'homeHStores');
    await put(SETTING_HOME_H_PRODUCTS, 'homeHProducts');
    await put(SETTING_HOME_H_FEATURED, 'homeHFeatured');
    await put(SETTING_HOME_H_LATEST, 'homeHLatest');
    await put(SETTING_HOME_H_MOSTVIEWED, 'homeHMostviewed');
  } else if (sec === 'ad') {
    await put(SETTING_AD_NOTICE, 'adNotice');
  } else if (sec === 'msg') {
    await put(SETTING_MSG_TPL_AD, 'msgTplAd');
    await put(SETTING_MSG_TPL_ADMIN, 'msgTplAdmin');
    await put('msg_tpl_support', 'msgTplSupport');
  } else if (sec === 'empty') {
    await put(SETTING_EMPTY_ADS, 'emptyAds');
    await put(SETTING_EMPTY_CHATS, 'emptyChats');
    await put(SETTING_EMPTY_STORES, 'emptyStores');
    await put(SETTING_EMPTY_REVIEWS, 'emptyReviews');
    await put(SETTING_EMPTY_CLASSIFIED, 'emptyClassified');
  } else if (sec === 'sub') {
    await put(SETTING_SUB_REMINDER_MSG, 'subReminderMsg');
    await put(SETTING_SHOW_REMINDER_MSG, 'showReminderMsg');
    await put(SETTING_ADSHOW_REMINDER_MSG, 'adshowReminderMsg');
  } else if (sec === 'verify') {
    await put(SETTING_MSG_VERIFY_OK, 'msgVerifyOk');
    await put(SETTING_MSG_VERIFY_REJECT, 'msgVerifyReject');
  } else if (sec === 'wallet') {
    await put(SETTING_TOPUP_NAME_NOTE, 'topupNameNote');
    await put(SETTING_TOPUP_INFO, 'topupInfo');
    await put(SETTING_MSG_TOPUP_OK, 'msgTopupOk');
    await put(SETTING_MSG_TOPUP_REJECT, 'msgTopupReject');
    await put(SETTING_MSG_TOPUP_CANCEL, 'msgTopupCancel');
  } else if (sec === 'welcome') {
    await put(SETTING_WELCOME_GUEST_TEXT, 'welcomeGuestText');
    await put(SETTING_WELCOME_MEMBER_TEXT, 'welcomeMemberText');
    const secs = Math.min(30, Math.max(2, parseInt(String(formData.get('welcomePopupSeconds') || '4')) || 4));
    await setSetting(SETTING_WELCOME_POPUP_SECONDS, String(secs));
  } else if (sec === 'feedbanner') {
    // بانر الرئيسية: نصوص تسويقية وتوعوية (سطر لكل نص) — مسحهما معاً يوقف البانر
    await put('feed_texts_promo', 'feedPromo');
    await put('feed_texts_aware', 'feedAware');
  }
  await logAdmin(session.uid, 'تعديل النصوص', `تبويب ${sec}`);
  revalidatePath('/admin/texts');
  revalidatePath('/', 'layout');
  redirect(`/admin/texts?sec=${sec}&saved=1`);
}

export async function saveSettingsAction(formData: FormData) {
 try {
  const session = await requireAction('users', 'edit');
  const editH = Math.max(0, parseInt(String(formData.get('editHours') || '0')) || 0);
  const delH = Math.max(0, parseInt(String(formData.get('deleteHours') || '0')) || 0);
  const msgDelMin = Math.max(0, parseInt(String(formData.get('msgDeleteMinutes') || '0')) || 0);
  const homeStats = HOME_STAT_KEYS.filter((k) => formData.get(`stat_${k}`) !== null).join(',');
  const cs = String(formData.get('classifiedStats') || 'owner');
  const classifiedStats = ['all', 'owner', 'admin'].includes(cs) ? cs : 'owner';
  const classifiedDays = Math.max(0, parseInt(String(formData.get('classifiedDays') || '0')) || 0);
  const splashSeconds = Math.min(60, Math.max(2, parseInt(String(formData.get('splashSeconds') || '5')) || 5));
  const adsApproval = formData.get('adsApproval') !== null ? '1' : '0';
  const dupTitle = Math.min(100, Math.max(50, parseInt(String(formData.get('dupTitlePct') || '90')) || 90));
  const dupDetail = Math.min(100, Math.max(50, parseInt(String(formData.get('dupDetailPct') || '90')) || 90));
  const dupImage = Math.min(100, Math.max(50, parseInt(String(formData.get('dupImagePct') || '95')) || 95));
  const strikeBanDays = Math.max(0, parseInt(String(formData.get('strikeBanDays') || '0')) || 0);
  await setSetting(SETTING_ADS_APPROVAL, adsApproval);
  await setSetting(SETTING_DUP_TITLE_PCT, String(dupTitle));
  await setSetting(SETTING_DUP_DETAIL_PCT, String(dupDetail));
  await setSetting(SETTING_DUP_IMAGE_PCT, String(dupImage));
  await setSetting(SETTING_STRIKE_BAN_DAYS, String(strikeBanDays));
  await setSetting(SETTING_AD_EDIT_HOURS, String(editH));
  await setSetting(SETTING_AD_DELETE_HOURS, String(delH));
  await setSetting(SETTING_MSG_DELETE_MINUTES, String(msgDelMin));
  await setSetting('max_profiles', String(Math.max(0, parseInt(String(formData.get('maxProfiles') || '0')) || 0)));
  await setSetting('max_stores', String(Math.max(0, parseInt(String(formData.get('maxStores') || '0')) || 0)));
  // باقات الهويات: ٣ باقات × (اسم + عدد + شهري/نصف/سنوي) + إعفاء
  for (let i = 1; i <= 3; i++) {
    await setSetting(`idpkg${i}_name`, String(formData.get(`idpkg${i}_name`) || '').trim().slice(0, 24));
    for (const k of ['acc', 'm', 'h', 'y']) {
      await setSetting(`idpkg${i}_${k}`, String(Math.max(0, parseInt(String(formData.get(`idpkg${i}_${k}`) || '0')) || 0)));
    }
  }
  await setSetting('identity_exempt_days', String(Math.max(0, parseInt(String(formData.get('identityExemptDays') || '0')) || 0)));
  await setSetting(SETTING_HOME_STATS, homeStats);
  await setSetting(SETTING_CLASSIFIED_STATS, classifiedStats);
  await setSetting(SETTING_CLASSIFIED_DAYS, String(classifiedDays));
  await setSetting('ad_lifetime_days', String(Math.max(0, parseInt(String(formData.get('adLifetimeDays') || '0')) || 0)));
  await setSetting(SETTING_CLASSIFIED_SECONDS, String(splashSeconds));
  // مفاتيح الميزات: التنبيهات الفورية، اقتراحات البحث، تنبيهات البحث المحفوظ
  await setSetting('home_actions_on', formData.get('homeActionsOn') !== null ? '1' : '0');
  await setSetting('archive_autodelete_on', formData.get('archiveAutodeleteOn') !== null ? '1' : '0');
  await setSetting('platform_rating_on', formData.get('platformRatingOn') !== null ? '1' : '0');
  await setSetting('push_on', formData.get('pushOn') !== null ? '1' : '0');
  await setSetting('search_suggest_on', formData.get('searchSuggestOn') !== null ? '1' : '0');
  await setSetting('saved_search_on', formData.get('savedSearchOn') !== null ? '1' : '0');
  await setSetting('match_notify_on', formData.get('matchNotifyOn') !== null ? '1' : '0');
  await setSetting('store_report_on', formData.get('storeReportOn') !== null ? '1' : '0');
  await setSetting('schedule_on', formData.get('scheduleOn') !== null ? '1' : '0');
  await setSetting('schedule_max_days', String(Math.max(0, parseInt(String(formData.get('scheduleMaxDays') || '30')) || 0)));
  await setSetting('bump_on', formData.get('bumpOn') !== null ? '1' : '0');
  await setSetting('ad_contact_stats_on', formData.get('adContactStatsOn') !== null ? '1' : '0');
  // ميزات المتاجر: كوبونات + حالة التوفر + الدوام + عروض اليوم
  await setSetting('coupons_on', formData.get('couponsOn') !== null ? '1' : '0');
  await setSetting('stock_on', formData.get('stockOn') !== null ? '1' : '0');
  await setSetting('hours_on', formData.get('hoursOn') !== null ? '1' : '0');
  await setSetting('deals_on', formData.get('dealsOn') !== null ? '1' : '0');
  await setSetting('autorenew_on', formData.get('autoRenewOn') !== null ? '1' : '0');
  await setSetting('auction_on', formData.get('auctionOn') !== null ? '1' : '0');
  await setSetting('staff_on', formData.get('staffOn') !== null ? '1' : '0');
  // قفل اسم العضو: التغيير عبر طلب بموافقة الإدارة (مستند + سبب)
  await setSetting('namelock_on', formData.get('nameLockOn') !== null ? '1' : '0');
  // classified duplicate prevention: toggle + content/image/background thresholds
  await setSetting(SETTING_CDUP_ON, formData.get('cdupOn') !== null ? '1' : '0');
  await setSetting(SETTING_CDUP_CONTENT_PCT, String(Math.min(100, Math.max(50, parseInt(String(formData.get('cdupContentPct') || '90')) || 90))));
  await setSetting(SETTING_CDUP_IMAGE_PCT, String(Math.min(100, Math.max(50, parseInt(String(formData.get('cdupImagePct') || '95')) || 95))));
  await setSetting(SETTING_CDUP_BG_PCT, String(Math.min(100, Math.max(50, parseInt(String(formData.get('cdupBgPct') || '100')) || 100))));
  // native app shells: store links + minimum versions (raising min = forced update)
  await setSetting(APP_KEYS.androidPackage, String(formData.get('appAndroidPackage') || 'com.trbhh.app').trim());
  await setSetting(APP_KEYS.androidSha256, String(formData.get('appAndroidSha256') || '').trim());
  await setSetting(APP_KEYS.androidStoreUrl, String(formData.get('appAndroidStoreUrl') || '').trim());
  await setSetting(APP_KEYS.androidMinCode, String(Math.max(1, parseInt(String(formData.get('appAndroidMinCode') || '2')) || 2)));
  await setSetting(APP_KEYS.iosStoreUrl, String(formData.get('appIosStoreUrl') || '').trim());
  await setSetting(APP_KEYS.iosMinBuild, String(Math.max(1, parseInt(String(formData.get('appIosMinBuild') || '2')) || 2)));
  await logAdmin(session.uid, 'تعديل الإعدادات');
  revalidatePath('/admin/settings');
  revalidatePath('/');
  revalidatePath('/classified');
  redirect('/admin/settings?saved=1');
 } catch (e: unknown) {
  // أعد رمي إعادة التوجيه/عدم الوجود (سلوك Next الطبيعي) — والباقي أخطاء حقيقية تُسجَّل
  const digest = (e as { digest?: string })?.digest || '';
  if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))) throw e;
  try {
    const { logClientError } = await import('@/lib/error-log');
    await logClientError({ message: 'saveSettingsAction: ' + ((e as Error)?.message || String(e)), stack: (e as Error)?.stack, url: '/admin/settings' });
  } catch { /* لا شيء */ }
  redirect('/admin/settings?error=save');
 }
}

/** Revenue hub: store-subscription plans + grace, and ad-service/duplicate pricing. */
export async function saveRevenueAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const nn = (k: string, d = 0) => String(Math.max(0, parseInt(String(formData.get(k) || d)) || d));
  await setSetting(SETTING_SUB_ENABLED, formData.get('subEnabled') !== null ? '1' : '0');
  await setSetting(SETTING_SUB_MONTHLY, nn('subMonthly'));
  await setSetting(SETTING_SUB_6MO, nn('sub6mo'));
  await setSetting(SETTING_SUB_YEARLY, nn('subYearly'));
  await setSetting(SETTING_SUB_GRACE_DAYS, String(Math.max(0, parseInt(String(formData.get('subGraceDays') || '10')) || 10)));
  await setSetting(SETTING_SUB_TRIAL_DAYS, nn('subTrialDays'));
  // تنبيهات قرب انتهاء الاشتراك: قبل كم يوم + كم مرة
  await setSetting(SETTING_SUB_REMIND_DAYS, nn('subRemindDays'));
  await setSetting(SETTING_SUB_REMIND_COUNT, nn('subRemindCount'));
  // مكافأة أول شحن + هدية التوثيق (حملات الشحن لها جدول مستقل بإجراءاته)
  const { SETTING_TOPUP_FIRST_BONUS, SETTING_VERIFY_GIFT, SETTING_TOPUP_BONUS_PCT, SETTING_TOPUP_BONUS_MIN } = await import('@/lib/settings');
  await setSetting(SETTING_TOPUP_BONUS_PCT, '0');
  await setSetting(SETTING_TOPUP_BONUS_MIN, '0');
  await setSetting(SETTING_TOPUP_FIRST_BONUS, nn('topupFirstBonus'));
  await setSetting(SETTING_VERIFY_GIFT, nn('verifyGift'));
  // التوثيق المدفوع: الرسوم + المدة بالأيام (0 رسوم = الخدمة معطلة)
  const { SETTING_VERIFY_FEE, SETTING_VERIFY_FEE_DAYS } = await import('@/lib/settings');
  await setSetting(SETTING_VERIFY_FEE, nn('verifyFee'));
  await setSetting(SETTING_VERIFY_FEE_DAYS, String(Math.max(1, parseInt(String(formData.get('verifyFeeDays') || '30')) || 30)));
  await setSetting('verify_fee_2', nn('verifyFee2'));
  await setSetting('verify_fee_days_2', String(Math.max(1, parseInt(String(formData.get('verifyFeeDays2') || '90')) || 90)));
  await setSetting('verify_fee_3', nn('verifyFee3'));
  await setSetting('verify_fee_days_3', String(Math.max(1, parseInt(String(formData.get('verifyFeeDays3') || '365')) || 365)));
  // توثيق الحساب العادي: مدة الصلاحية (0 = دائم) + رسم التجديد التلقائي
  await setSetting('acct_verify_days', String(Math.max(0, parseInt(String(formData.get('acctVerifyDays') || '0')) || 0)));
  await setSetting('acct_verify_fee', nn('acctVerifyFee'));
  // المزادات: رسم الفتح + أقصى مدة
  await setSetting('auction_fee', nn('auctionFee'));
  await setSetting('auction_max_days', String(Math.min(30, Math.max(1, parseInt(String(formData.get('auctionMaxDays') || '7')) || 7))));
  // باقة متجر Plus + عمولة توصيل عميل
  await setSetting('plus_on', formData.get('plusOn') !== null ? '1' : '0');
  await setSetting('plus_monthly', nn('plusMonthly'));
  await setSetting('plus_6mo', nn('plus6mo'));
  await setSetting('plus_yearly', nn('plusYearly'));
  await setSetting('lead_on', formData.get('leadOn') !== null ? '1' : '0');
  await setSetting('lead_price', nn('leadPrice'));
  await setSetting('lead_daily_cap', String(Math.max(1, parseInt(String(formData.get('leadDailyCap') || '10')) || 10)));
  // النمو والمكافآت: رصيد ترحيبي + دعوة صديق + نظام النقاط
  await setSetting('welcome_credit', nn('welcomeCredit'));
  await setSetting('referral_on', formData.get('referralOn') !== null ? '1' : '0');
  await setSetting('referral_reward', nn('referralReward'));
  await setSetting('points_on', formData.get('pointsOn') !== null ? '1' : '0');
  await setSetting('pts_daily', nn('ptsDaily'));
  await setSetting('pts_first_ad', nn('ptsFirstAd'));
  await setSetting('pts_verify', nn('ptsVerify'));
  await setSetting('pts_rate', String(Math.max(1, parseInt(String(formData.get('ptsRate') || '100')) || 100)));
  await setSetting('pts_min_convert', String(Math.max(1, parseInt(String(formData.get('ptsMinConvert') || '500')) || 500)));
  // خدمات الإعلان: عاجل (باقتا 24/48 ساعة) + تحديث
  await setSetting('urgent_price_24', nn('urgentPrice24'));
  await setSetting('urgent_price_48', nn('urgentPrice48'));
  await setSetting('bump_free_days', nn('bumpFreeDays'));
  await setSetting('bump_price', nn('bumpPrice'));
  // رسوم إعادة إظهار الإعلان المؤرشف
  await setSetting('ad_restore_fee', nn('adRestoreFee'));
  // الظهور المدفوع في تربح: عرض المتجر (بالمدد) + باقات عرض الإعلان (السعر والمدة لكل باقة)
  await setSetting('show_store_w2', nn('showStoreW2'));
  await setSetting('show_store_m1', nn('showStoreM1'));
  await setSetting('show_store_y1', nn('showStoreY1'));
  for (const k of ['gold', 'silver', 'regular']) {
    await setSetting(`show_ad_${k}`, nn(`showAd_${k}`));
    await setSetting(`show_ad_${k}_days`, String(Math.max(1, parseInt(String(formData.get(`showAdDays_${k}`) || '1')) || 1)));
  }
  // مصفوفة تسعيرات الخدمات (خدمة × مدّة)
  const services: PaidService[] = ['featured', 'classified', 'dup3', 'dup5'];
  for (const s of services) {
    for (const d of DURATIONS) {
      const key = servicePriceKey(s, d.key);
      await setSetting(key, nn(key));
    }
  }
  await logAdmin(session.uid, 'تعديل التسعيرات والعروض');
  revalidatePath('/admin/revenue');
  revalidatePath('/store');
  redirect('/admin/revenue?saved=1');
}

/** Admin grants/extends/clears a store's subscription (days from now; 0 = clear). */
export async function adminSetStoreSubAction(formData: FormData) {
  await requireAction('stores', 'edit');
  const storeId = toInt(BigInt(String(formData.get('storeId') || '0')));
  const days = parseInt(String(formData.get('days') || '0')) || 0;
  const { adminSetStoreSub } = await import('@/lib/subscription');
  const until = days > 0 ? new Date(Date.now() + days * 86400000) : null;
  await adminSetStoreSub(storeId, until);
  revalidatePath(`/admin/stores`);
  redirect('/admin/revenue?saved=1');
}

/** Admin grants extra free days to a store (extend trial / comp time). */
export async function grantStoreDaysAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const storeId = toInt(BigInt(String(formData.get('storeId') || '0')));
  const days = Math.max(1, parseInt(String(formData.get('days') || '0')) || 0);
  if (storeId && days) {
    const { adminGrantStoreDays } = await import('@/lib/subscription');
    await adminGrantStoreDays(storeId, days);
    await logAdmin(session.uid, 'منح أيام مجانية لمتجر', `متجر #${storeId}`, `${days} يوم`);
  }
  revalidatePath('/admin/stores');
  redirect('/admin/stores?granted=1');
}

/** Save the permission matrix for one role (checkbox keys named "k"). Manager-only — see setUserPermsAction. */
export async function saveRolePermsAction(formData: FormData) {
  await requireManager();
  const role = String(formData.get('role') || '') as Role;
  if (!MATRIX_ROLES.includes(role)) return;
  const keys = formData.getAll('k').map((v) => String(v));
  await setRolePermKeys(role, keys);
  revalidatePath('/admin/roles');
  redirect(`/admin/roles?saved=${role}`);
}

/** Save messaging/verification gateway settings (SMS + WhatsApp). */
export async function saveVerificationAction(formData: FormData) {
  await requireAction('users', 'edit');
  const s = (k: string) => String(formData.get(k) || '').trim();
  const ch = s('channel');
  const channel = ch === 'whatsapp' || ch === 'both' ? ch : 'sms';
  const provider = s('sms_provider') === 'legacy' ? 'legacy' : 'jawaly_v1';
  const defUrl = provider === 'legacy' ? '' : 'https://api-sms.4jawaly.com/api/v1/account/area/sms/send';
  await Promise.all([
    setSetting(MSG_KEYS.smsProvider, provider),
    setSetting(MSG_KEYS.smsUrl, s('sms_url') || defUrl),
    // المفتاح/السر لا يحتويان مسافات إطلاقاً — تُزال أي مسافة لُصقت بالخطأ.
    setSetting(MSG_KEYS.smsUser, s('sms_username').replace(/\s+/g, '')),
    setSetting(MSG_KEYS.smsPass, s('sms_password').replace(/\s+/g, '')),
    setSetting(MSG_KEYS.smsSender, s('sms_sender')),
    setSetting(MSG_KEYS.smsUnicode, s('sms_unicode') || 'e'),
    setSetting(MSG_KEYS.waUrl, s('wa_url') || 'https://user.4whats.net/api/sendMessage'),
    setSetting(MSG_KEYS.waInstance, s('wa_instance')),
    setSetting(MSG_KEYS.waToken, s('wa_token')),
    setSetting(MSG_KEYS.channel, channel),
    setSetting(MSG_KEYS.enabled, formData.get('enabled') !== null ? '1' : '0'),
  ]);
  revalidatePath('/admin/verification');
  redirect('/admin/verification?saved=1');
}

/* ---- Database backup / restore ---- */
const errUrl = (msg: string) => `/admin/backup?error=${encodeURIComponent(msg).slice(0, 200)}`;

export async function createBackupAction() {
  await requireAction('backup', 'add');
  let dest = '/admin/backup?done=backup';
  try {
    const name = await createBackup();
    dest = `/admin/backup?done=backup&name=${encodeURIComponent(name)}`;
  } catch (e) {
    dest = errUrl(e instanceof Error ? e.message : 'فشل إنشاء النسخة');
  }
  revalidatePath('/admin/backup');
  redirect(dest);
}

export async function deleteBackupAction(formData: FormData) {
  await requireAction('backup', 'delete');
  const name = String(formData.get('name') || '');
  let dest = '/admin/backup?done=deleted';
  try {
    await deleteBackup(name);
  } catch (e) {
    dest = errUrl(e instanceof Error ? e.message : 'فشل الحذف');
  }
  revalidatePath('/admin/backup');
  redirect(dest);
}

export async function restoreBackupAction(formData: FormData) {
  await requireAction('backup', 'edit');
  const name = String(formData.get('name') || '');
  const confirm = String(formData.get('confirm') || '').trim();
  const agree = formData.get('agree') !== null;
  let dest: string;
  if (!agree || confirm !== 'استعادة') {
    dest = errUrl('لم تُؤكّد الاستعادة بشكل صحيح — يجب كتابة كلمة «استعادة» وتعليم الإقرار.');
  } else {
    try {
      const { safety } = await restoreBackup(name);
      dest = `/admin/backup?done=restore&name=${encodeURIComponent(name)}&safety=${encodeURIComponent(safety)}`;
    } catch (e) {
      dest = errUrl(e instanceof Error ? e.message : 'فشلت الاستعادة');
    }
  }
  revalidatePath('/admin/backup');
  redirect(dest);
}

export async function trustUserAction(formData: FormData) {
  const session = await requireAction('verifications', 'edit');
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u && u.trusted !== 1) {
    // المنح فقط — الإلغاء له إجراء مستقل بسبب إلزامي (untrustUserAction)
    await prisma.users.update({ where: { id }, data: { trusted: 1, step: 0, verified_at: new Date() } });
    await logAdmin(session.uid, 'توثيق عضو (زر سريع)', `العضو #${toInt(id)}`);
  }
  revalidatePath('/admin/users');
  revalidatePath('/admin/verifications');
}

/** إلغاء التوثيق بسبب إلزامي يُحفظ ويصل العضو — وإن كان توثيقاً مدفوعاً نشطاً
 *  يمر عبر مسار الإلغاء المدفوع فيُعاد للرصيد قيمة الأيام غير المستخدمة تلقائياً. */
async function untrustCore(adminId: number, id: number, reason: string) {
  const { cancelPaidVerification } = await import('@/lib/verify-paid');
  const activeOrder = await prisma.verify_orders.findFirst({ where: { user_id: BigInt(id), status: 1 } }).catch(() => null);
  if (activeOrder) {
    const r = await cancelPaidVerification(toInt(activeOrder.id), adminId, reason);
    if (r) {
      await sendVerifyMessage(id, 'msg_verify_paid_cancel', 'عذراً {name}، أُلغي توثيق متجرك. السبب: {reason} — أُعيد لرصيدك {amount} ر.س قيمة الأيام غير المستخدمة.', reason, { amount: String(r.refund) });
      await logAdmin(adminId, 'إلغاء توثيق مدفوع', `العضو #${id}`, `${reason} — استرداد ${r.refund} ر.س`);
    }
  } else {
    await prisma.users.update({ where: { id: BigInt(id) }, data: { trusted: 0, verified_at: null } }).catch(() => {});
    await sendVerifyMessage(id, 'msg_verify_cancel', 'عذراً {name}، أُلغيت علامة التوثيق عن حسابك. السبب: {reason} — للاستفسار راسل الإدارة من «الرسائل».', reason);
    await logAdmin(adminId, 'إلغاء توثيق', `العضو #${id}`, reason);
  }
  revalidatePath('/admin/users');
  revalidatePath('/admin/verifications');
  revalidatePath('/admin/stores');
  revalidatePath('/account/wallet');
}

export async function untrustUserAction(formData: FormData) {
  const session = await requireAction('verifications', 'edit');
  const id = Number(formData.get('userId') || 0);
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!id || !reason) return;
  await untrustCore(session.uid, id, reason);
}

/** إلغاء توثيق المتجر من صفحة إدارة المتاجر (بصلاحية المتاجر) — يسحب علامة التوثيق فقط،
 *  ولا يمس المتجر ولا إعلاناته؛ والمدفوع يُسترد له غير المستخدم تلقائياً. */
export async function storeUntrustAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('userId') || 0);
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!id || !reason) return;
  await untrustCore(session.uid, id, reason);
}

/** موافقة إدارة المتاجر على التوثيق المدفوع: خصم الرسوم أولاً — لا توثيق بلا رصيد كافٍ. */
export async function approveVerifyOrderAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('id') || 0);
  if (!id) return;
  const { approvePaidVerification } = await import('@/lib/verify-paid');
  const r = await approvePaidVerification(id, session.uid);
  if (r.ok && r.order) {
    await sendVerifyMessage(r.order.userId, 'msg_verify_paid_ok', 'تهانينا {name} 🎉 تمت الموافقة على توثيق متجرك وخُصمت الرسوم ({amount} ر.س) من رصيدك — شارة «موثّق» فعّالة الآن لمدة {days} يوماً.', '', { amount: String(r.order.fee), days: String(r.order.days) });
    await logAdmin(session.uid, 'موافقة توثيق مدفوع', `طلب #${id} — العضو #${r.order.userId}`, `${r.order.fee} ر.س / ${r.order.days} يوم`);
    revalidatePath('/', 'layout'); // يحدّث شريط التنبيه العالمي بعد نقص عدد الطلبات المعلقة
  } else if (r.reason === 'balance' && r.order) {
    await sendVerifyMessage(r.order.userId, 'msg_verify_paid_balance', 'عذراً {name}، وافقت إدارة المتاجر على توثيق متجرك لكن رصيدك ({balance} ر.س) لا يغطي الرسوم ({amount} ر.س) — اشحن رصيدك من «محفظتي» وسيُفعَّل التوثيق فور اكتمال الرصيد وإعادة الموافقة.', '', { amount: String(r.order.fee), balance: String(r.balance ?? 0) });
    await logAdmin(session.uid, 'موافقة توثيق مدفوع (رصيد غير كافٍ)', `طلب #${id} — العضو #${r.order.userId}`, `المطلوب ${r.order.fee} والرصيد ${r.balance ?? 0}`);
    revalidatePath('/admin/stores');
    redirect('/admin/stores?vbal=1');
  }
  revalidatePath('/admin/stores');
}

/** رفض طلب التوثيق المدفوع مع سبب يُحفظ ويصل العضو. */
export async function rejectVerifyOrderAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('id') || 0);
  // السبب اختياري: لا نمنع الرفض إن تُرك فارغاً (كان الحقل الإلزامي يحجب الإرسال بصمت
  // بعد نافذة التأكيد فيبقى الطلب معلقاً دون أن يدري الإداري) — نستخدم سبباً افتراضياً.
  const note = String(formData.get('note') || '').trim().slice(0, 300) || 'لم تُذكر الإدارة سبباً محدداً.';
  if (!id) return;
  const { rejectPaidVerification } = await import('@/lib/verify-paid');
  const r = await rejectPaidVerification(id, session.uid, note);
  if (r) {
    await sendVerifyMessage(r.userId, 'msg_verify_paid_reject', 'عذراً {name}، رُفض طلب توثيق متجرك. السبب: {reason} — لم يُخصم أي مبلغ من رصيدك.', note);
    await logAdmin(session.uid, 'رفض توثيق مدفوع', `طلب #${id} — العضو #${r.userId}`, note);
  }
  revalidatePath('/admin/stores');
  revalidatePath('/', 'layout'); // يحدّث شريط تنبيه الإدارة العالمي في كل الصفحات فوراً
}

/** إلغاء توثيق مدفوع نشط بسبب إلزامي + استرداد قيمة الأيام غير المستخدمة للرصيد. */
export async function cancelVerifyOrderAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const id = Number(formData.get('id') || 0);
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!id || !reason) return;
  const { cancelPaidVerification } = await import('@/lib/verify-paid');
  const r = await cancelPaidVerification(id, session.uid, reason);
  if (r) {
    await sendVerifyMessage(r.order.userId, 'msg_verify_paid_cancel', 'عذراً {name}، أُلغي توثيق متجرك. السبب: {reason} — أُعيد لرصيدك {amount} ر.س قيمة الأيام غير المستخدمة.', reason, { amount: String(r.refund) });
    await logAdmin(session.uid, 'إلغاء توثيق مدفوع', `طلب #${id} — العضو #${r.order.userId}`, `${reason} — استرداد ${r.refund} ر.س`);
  }
  revalidatePath('/admin/stores');
  revalidatePath('/account/wallet');
}

/** رسالة إدارية للعضو بقرار التوثيق — النص من تبويب «النصوص» ({name}/{reason}). */
async function sendVerifyMessage(userId: number, key: string, fallback: string, reason = '', extra: Record<string, string> = {}) {
  const [{ getSetting }, { getPrimaryAdminId }, { sendChat }] = await Promise.all([
    import('@/lib/settings'), import('@/lib/admin-inbox'), import('@/lib/chat'),
  ]);
  const adminId = await getPrimaryAdminId().catch(() => 0);
  if (!adminId || adminId === userId) return;
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { name: true, userName: true } }).catch(() => null);
  const tpl = await getSetting(key, fallback);
  if (!tpl.trim()) return; // نص فارغ = تعطيل الرسالة
  let body = tpl.replace(/\{name\}/g, u?.name || u?.userName || 'عضو').replace(/\{reason\}/g, reason || '—');
  for (const [k, v] of Object.entries(extra)) body = body.split(`{${k}}`).join(v);
  await sendChat(adminId, userId, body).catch(() => {});
}

/** حذف تنبيه عضو (اطّلاع الإدارة). */
export async function adminDeleteNotifAction(formData: FormData) {
  const session = await requireAction('messages', 'delete');
  const id = BigInt(String(formData.get('id') || '0'));
  await prisma.notfications.delete({ where: { id } }).catch(() => {});
  await logAdmin(session.uid, 'حذف تنبيه', `تنبيه #${toInt(id)}`);
  revalidatePath('/admin/notifs');
}

/** حذف كل التنبيهات المقروءة (تنظيف الأرشيف). */
export async function adminClearReadNotifsAction() {
  const session = await requireAction('messages', 'delete');
  const r = await prisma.notfications.deleteMany({ where: { NOT: { read_at: null } } }).catch(() => ({ count: 0 }));
  await logAdmin(session.uid, 'حذف التنبيهات المقروءة', `${r.count} تنبيه`);
  revalidatePath('/admin/notifs');
}

/** مسح سجل الأخطاء التقنية بالكامل (بعد المراجعة/الإصلاح). */
export async function clearErrorLogAction() {
  const session = await requireAction('users', 'edit');
  const { clearErrorLogs } = await import('@/lib/error-log');
  await clearErrorLogs();
  await logAdmin(session.uid, 'مسح سجل الأخطاء التقنية');
  revalidatePath('/admin/errors');
}

/** تأكيد وصول مبلغ طلب الشحن: إضافة المبلغ للرصيد + رسالة للعضو. */
export async function approveTopupAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const id = Number(formData.get('id') || 0);
  if (!id) return;
  const { approveTopup } = await import('@/lib/wallet');
  const req = await approveTopup(id, session.uid);
  if (req) {
    const { SETTING_MSG_TOPUP_OK: k, DEFAULT_MSG_TOPUP_OK } = await import('@/lib/settings');
    await sendVerifyMessage(req.userId, k, DEFAULT_MSG_TOPUP_OK, '', { amount: String(req.amount) });
    await logAdmin(session.uid, 'تأكيد شحن رصيد', `طلب #${id}`, `${req.amount} ر.س للعضو #${req.userId}`);
  }
  revalidatePath('/admin/topups');
  revalidatePath('/account/wallet');
}

/** إضافة حساب تحويل (بنك/رقم/اسم) يظهر للأعضاء في «محفظتي». */
export async function addTopupAccountAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const bank = String(formData.get('bank') || '').trim().slice(0, 80);
  const number = String(formData.get('number') || '').trim().slice(0, 80);
  const iban = String(formData.get('iban') || '').trim().slice(0, 80);
  const name = String(formData.get('name') || '').trim().slice(0, 120);
  if (bank || number || iban || name) {
    const accounts = await getTopupAccounts();
    await setTopupAccounts([...accounts, { bank, number, iban, name }]);
    await logAdmin(session.uid, 'إضافة حساب شحن', bank || number);
  }
  revalidatePath('/admin/revenue');
  revalidatePath('/account/wallet');
  redirect('/admin/revenue?tab=accounts&saved=1');
}

/** حذف حساب تحويل. */
export async function deleteTopupAccountAction(formData: FormData) {
  await requireAction('users', 'edit');
  const idx = Number(formData.get('idx'));
  const accounts = await getTopupAccounts();
  if (Number.isInteger(idx) && idx >= 0 && idx < accounts.length) {
    accounts.splice(idx, 1);
    await setTopupAccounts(accounts);
  }
  revalidatePath('/admin/revenue');
  revalidatePath('/account/wallet');
  redirect('/admin/revenue?tab=accounts');
}

/** إضافة مصروف للموقع (يظهر في الميزانية المفصلة). */
export async function addSiteExpenseAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const label = String(formData.get('label') || '').trim();
  const amount = Math.round(Number(formData.get('amount') || 0));
  const note = String(formData.get('note') || '').trim();
  const spentAt = String(formData.get('spentAt') || '').trim();
  const { addSiteExpense } = await import('@/lib/wallet');
  await addSiteExpense(label, amount, session.uid, { note, spentAt });
  await logAdmin(session.uid, 'إضافة مصروف', label, `${amount} ر.س`);
  revalidatePath('/admin/revenue');
  redirect('/admin/revenue?tab=expenses&saved=1');
}

/** حذف مصروف. */
export async function deleteSiteExpenseAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const id = Number(formData.get('id') || 0);
  if (!id) return;
  const { deleteSiteExpense } = await import('@/lib/wallet');
  await deleteSiteExpense(id);
  await logAdmin(session.uid, 'حذف مصروف', `مصروف #${id}`);
  revalidatePath('/admin/revenue');
}

/** إلغاء تأكيد شحن سبق اعتماده (سند مكرر/خطأ): خصم المبلغ + سبب إلزامي + رسالة للعضو. */
export async function cancelTopupAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const id = Number(formData.get('id') || 0);
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!id || !reason) return;
  const { cancelTopup } = await import('@/lib/wallet');
  const req = await cancelTopup(id, session.uid, reason);
  if (req) {
    const { SETTING_MSG_TOPUP_CANCEL: k, DEFAULT_MSG_TOPUP_CANCEL } = await import('@/lib/settings');
    await sendVerifyMessage(req.userId, k, DEFAULT_MSG_TOPUP_CANCEL, reason, { amount: String(req.amount) });
    await logAdmin(session.uid, 'إلغاء تأكيد شحن', `طلب #${id}`, `${req.amount} ر.س خُصم من العضو #${req.userId} — ${reason}`);
  }
  revalidatePath('/admin/topups');
  revalidatePath('/account/wallet');
}

/** رفض طلب الشحن مع سبب يبقى محفوظاً + رسالة للعضو بالسبب. */
export async function rejectTopupAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const id = Number(formData.get('id') || 0);
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!id || !reason) return;
  const { rejectTopup } = await import('@/lib/wallet');
  const req = await rejectTopup(id, session.uid, reason);
  if (req) {
    const { SETTING_MSG_TOPUP_REJECT: k, DEFAULT_MSG_TOPUP_REJECT } = await import('@/lib/settings');
    await sendVerifyMessage(req.userId, k, DEFAULT_MSG_TOPUP_REJECT, reason, { amount: String(req.amount) });
    await logAdmin(session.uid, 'رفض شحن رصيد', `طلب #${id}`, reason);
  }
  revalidatePath('/admin/topups');
  revalidatePath('/account/wallet');
}

/** الموافقة على التوثيق: تفعيل فوري + رسالة للعضو. */
export async function approveVerificationAction(formData: FormData) {
  const session = await requireAction('verifications', 'edit');
  const id = Number(formData.get('userId') || 0);
  if (!id) return;
  await prisma.users.update({ where: { id: BigInt(id) }, data: { trusted: 1, step: 0, verify_note: null, verified_at: new Date() } }).catch(() => {});
  const { SETTING_MSG_VERIFY_OK, DEFAULT_MSG_VERIFY_OK } = await import('@/lib/settings');
  await sendVerifyMessage(id, SETTING_MSG_VERIFY_OK, DEFAULT_MSG_VERIFY_OK);
  // هدية التوثيق (إن فُعّلت من الإيرادات) — مرة واحدة لكل عضو
  const { grantVerifyGift } = await import('@/lib/wallet');
  const gift = await grantVerifyGift(id, session.uid);
  // نقاط التوثيق + مكافأة الإحالة عند توثيق المدعو
  import('@/lib/points').then(async (m) => {
    const cfg = await m.getPointsConfig();
    await m.grantPoints(id, cfg.verify, 'verify', true);
    await m.rewardReferral(id);
  }).catch(() => {});
  if (gift > 0) await sendVerifyMessage(id, '__none__', `🎁 أُضيفت هدية التوثيق: ${gift} ر.س إلى رصيدك — استمتع بها في خدمات تربح.`);
  await logAdmin(session.uid, 'قبول توثيق', `العضو #${id}`);
  revalidatePath('/admin/verifications');
  revalidatePath('/admin/users');
}

/** رفض التوثيق مع سبب يبقى محفوظاً + رسالة للعضو بالسبب. */
export async function rejectVerificationAction(formData: FormData) {
  const session = await requireAction('verifications', 'edit');
  const id = Number(formData.get('userId') || 0);
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!id || !reason) return;
  await prisma.users.update({ where: { id: BigInt(id) }, data: { trusted: 0, step: 2, verify_note: reason } }).catch(() => {});
  const { SETTING_MSG_VERIFY_REJECT, DEFAULT_MSG_VERIFY_REJECT } = await import('@/lib/settings');
  await sendVerifyMessage(id, SETTING_MSG_VERIFY_REJECT, DEFAULT_MSG_VERIFY_REJECT, reason);
  await logAdmin(session.uid, 'رفض توثيق', `العضو #${id}`, reason);
  revalidatePath('/admin/verifications');
}

/** حذف وثائق التوثيق (بعد تأكيد): يمسح المرفوعات وأعمدة الوثائق ويعيد الحالة. */
export async function deleteVerificationDocsAction(formData: FormData) {
  await requireAction('verifications', 'edit');
  const id = Number(formData.get('userId') || 0);
  if (!id) return;
  await prisma.uploads.deleteMany({ where: { user_id: id, type: { in: ['verify_nid', 'verify_cr', 'verify_wp'] } } }).catch(() => {});
  await prisma.users.update({
    where: { id: BigInt(id) },
    data: { national_identity: null, commercial_register: null, work_permit: null, step: 0 },
  }).catch(() => {});
  revalidatePath('/admin/verifications');
}

/** لا حذف مباشر: إعلان غير مؤرشف يُؤرشف أولاً (ينتقل لتبويب «المؤرشفة»)،
 *  والحذف النهائي لا يتم إلا على إعلان مؤرشف (من الأرشيف، يدوياً بتأكيد). */
export async function adminDeleteAdAction(formData: FormData) {
  const session = await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id }, select: { data_archive: true } }).catch(() => null);
  if (!a) { revalidatePath('/admin/ads'); return; }
  const isArchived = !!(a.data_archive && a.data_archive.trim() !== '');
  if (!isArchived) {
    await prisma.ads.update({ where: { id }, data: { status: 0, data_archive: new Date().toISOString() } }).catch(() => {});
    await logAdmin(session.uid, 'أرشفة إعلان (بدل الحذف المباشر)', `إعلان #${toInt(id)}`);
    await bustAdCaches().catch(() => {});
    revalidatePath('/admin/ads'); revalidatePath('/');
    return;
  }
  await prisma.photos.deleteMany({ where: { other_id: id } });
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  await logAdmin(session.uid, 'حذف إعلان نهائياً من الأرشيف', `إعلان #${toInt(id)}`);
  await bustAdCaches().catch(() => {});
  revalidatePath('/admin/ads');
}

/**
 * إغلاق بلاغ بإجراء إجباري: حظر صاحب الإعلان، حذفه (أرشفة)، أو تجاهل البلاغ (لا
 * مخالفة). يُرسل رسالة لصاحب الإعلان (إن حُظر أو حُذف) ورسالة تأكيد للمُبلِّغ
 * دائماً، ويُسجَّل في سجل التجاوزات — لا يبقى بلاغ بلا قرار وبلا إشعار الطرفين.
 */
export async function resolveReportAction(formData: FormData) {
  const session = await requireAction('reports', 'delete');
  const reportId = BigInt(String(formData.get('reportId') || '0'));
  const action = String(formData.get('action') || '');
  if (!reportId || !['ban', 'delete', 'dismiss'].includes(action)) { revalidatePath('/admin/reports'); return; }

  const report = await prisma.repord_ads.findUnique({ where: { id: reportId } });
  if (!report || report.status !== 0) { revalidatePath('/admin/reports'); return; }

  const ad = await prisma.ads.findUnique({ where: { id: BigInt(report.ads_id) }, select: { id: true, title: true, user_id: true, data_archive: true } });
  const adTitle = (ad?.title || `إعلان #${report.ads_id}`).slice(0, 80);
  const ownerId = ad ? toInt(ad.user_id) : 0;

  if (action === 'ban' && ownerId) {
    await banUserFor(ownerId, await getStrikeBanDays());
    await logMod(ownerId, { kind: 'report', category: null, term: null, snippet: `حظر بسبب بلاغ على «${adTitle}»`, action: 'banned', adId: ad ? toInt(ad.id) : null });
  }
  if (action === 'delete' && ad) {
    const isArchived = !!(ad.data_archive && ad.data_archive.trim() !== '');
    if (!isArchived) await prisma.ads.update({ where: { id: ad.id }, data: { status: 0, data_archive: new Date().toISOString() } }).catch(() => {});
    await logMod(ownerId || 0, { kind: 'report', category: null, term: null, snippet: `حذف الإعلان «${adTitle}» بسبب بلاغ`, action: 'blocked', adId: toInt(ad.id) });
  }
  await logAdmin(session.uid, `معالجة بلاغ: ${action === 'ban' ? 'حظر الناشر' : action === 'delete' ? 'حذف الإعلان' : 'تجاهل البلاغ'}`, `إعلان #${report.ads_id}`);

  // رسالة إجبارية لصاحب الإعلان عند اتخاذ إجراء ضده
  if (ownerId && (action === 'ban' || action === 'delete')) {
    const ownerMsg = action === 'ban'
      ? `تم حظر حسابك بسبب مخالفة إعلانك «${adTitle}» بعد مراجعة بلاغ من الإدارة.`
      : `تمت إزالة إعلانك «${adTitle}» لمخالفته شروط الاستخدام بعد مراجعة بلاغ من الإدارة.`;
    await prisma.notfications.create({ data: { title: ownerMsg.slice(0, 180), route: '/account/ads', user_id: String(ownerId), type: 'warning', model_id: Number(report.ads_id) } }).catch(() => {});
  }
  // رسالة إجبارية للمُبلِّغ دائماً — تؤكد أن البلاغ رُوجع مهما كانت النتيجة
  const reporterMsg = action === 'dismiss'
    ? `تمت مراجعة بلاغك على «${adTitle}» ولم نجد مخالفة تستدعي إجراءً. شكراً لك.`
    : `تمت مراجعة بلاغك على «${adTitle}» واتُخذ الإجراء المناسب. شكراً لك.`;
  await prisma.notfications.create({ data: { title: reporterMsg.slice(0, 180), route: '/', user_id: String(report.user_id), type: 'other', model_id: Number(report.ads_id) } }).catch(() => {});

  await prisma.repord_ads.update({ where: { id: reportId }, data: { status: 1, action, handled_at: new Date(), handled_by: BigInt(session.uid) } });
  await bustAdCaches().catch(() => {});
  revalidatePath('/admin/reports');
}

/** مراجعة حظر آلي (تبويب بلاغات الرصد الآلي): فكّ الحظر فوراً، أو الإبقاء عليه —
 *  أي قرار يُغلق تنبيه «حظر آلي جديد» في لوحة الإدارة ويصل العضو إشعار بالنتيجة. */
/** يبتّ في حظر آلي معلَّق (فكّ/إبقاء) — نفس صلاحية الحظر اليدوي المباشر (users:ban)
 *  لا صلاحية البلاغات: القرار هنا يغيّر حالة حظر حساب فعلياً، فلا يجوز لدور بلا
 *  صلاحية حظر (مثل «مراقب») فكّ حظر عضو من هذا المسار الجانبي. */
export async function reviewModLogAction(formData: FormData) {
  const session = await requireUserBan();
  const modLogId = parseInt(String(formData.get('modLogId') || '0'), 10);
  const decision = String(formData.get('decision') || '');
  if (!modLogId || !['unban', 'keep'].includes(decision)) { revalidatePath('/admin/reports'); return; }

  const result = await reviewAutoBan(modLogId, decision as 'unban' | 'keep');
  if (result?.userId) {
    await logAdmin(session.uid, decision === 'unban' ? 'فكّ حظر آلي بعد المراجعة' : 'الإبقاء على حظر آلي بعد المراجعة', `mod_log #${modLogId}`);
    await notifyModBlock(
      result.userId,
      decision === 'unban' ? '✅ راجعت الإدارة حظرك ورفعته عن حسابك — يمكنك المتابعة الآن.' : '⛔ راجعت الإدارة حظرك وقررت الإبقاء عليه.',
      '/account/ads',
    );
  }
  revalidatePath('/admin/reports');
}

/** مسح نهائي لسجل بلاغ عضو مُعالَج بالفعل (من الأرشيف فقط) — سجل تاريخي بحت لا يمس الإعلان أو العضو. */
export async function adminDeleteReportRecordAction(formData: FormData) {
  const session = await requireAction('reports', 'delete');
  const reportId = BigInt(String(formData.get('reportId') || '0'));
  if (reportId) {
    const r = await prisma.repord_ads.findUnique({ where: { id: reportId }, select: { status: true } }).catch(() => null);
    if (r && r.status !== 0) {
      await prisma.repord_ads.delete({ where: { id: reportId } }).catch(() => {});
      await logAdmin(session.uid, 'مسح سجل بلاغ من الأرشيف', `بلاغ #${reportId}`);
    }
  }
  revalidatePath('/admin/archive');
}

/** مسح نهائي لسطر في سجل الرصد الآلي (من الأرشيف فقط) — سجل تاريخي بحت. */
export async function adminDeleteModLogAction(formData: FormData) {
  const session = await requireAction('reports', 'delete');
  const id = parseInt(String(formData.get('modLogId') || '0'), 10);
  if (id) {
    const r = await prisma.mod_log.findUnique({ where: { id }, select: { action: true, reviewed_at: true } }).catch(() => null);
    // لا يُمسح حظر بانتظار المراجعة (يجب البتّ فيه أولاً من تبويب البلاغات الحيّ)
    if (r && !(r.action === 'banned' && !r.reviewed_at)) {
      await prisma.mod_log.delete({ where: { id } }).catch(() => {});
      await logAdmin(session.uid, 'مسح سطر من سجل الرصد الآلي (الأرشيف)', `mod_log #${id}`);
    }
  }
  revalidatePath('/admin/archive');
}

export async function adminToggleSpecialAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { adsSpecial: a.adsSpecial === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/ads');
}

export async function adminToggleAdStatusAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) {
    const archiving = a.status === 1; // hiding => archive (stamp date); showing => clear
    await prisma.ads.update({
      where: { id },
      // النشر من الإدارة يمسح علامة «أوقفه صاحبه» أيضاً
      data: { status: archiving ? 0 : 1, data_archive: archiving ? new Date().toISOString() : null, ...(archiving ? {} : { paused_by_owner: 0 }) },
    });
  }
  await bustAdCaches().catch(() => {}); // approved/hidden ad reflects immediately
  revalidatePath('/admin/ads');
  revalidatePath('/');
}

/** أرشفة كل الإعلانات المنتظِرة للموافقة (لا حذف مباشر) — تنتقل لتبويب
 *  «المؤرشفة» ومنه يمكن حذفها نهائياً بتأكيد. */
export async function deleteAllPendingAdsAction() {
  const session = await requireAction('ads', 'delete');
  const r = await prisma.ads.updateMany({
    // لا يشمل الموقوفة من أصحابها — تلك ليست بانتظار موافقة
    where: { status: 0, paused_by_owner: 0, OR: [{ data_archive: null }, { data_archive: '' }] },
    data: { status: 0, data_archive: new Date().toISOString() },
  }).catch(() => ({ count: 0 }));
  await logAdmin(session.uid, 'أرشفة كل الإعلانات المنتظِرة', `${r.count} إعلان`);
  await bustAdCaches().catch(() => {});
  revalidatePath('/admin/ads');
  revalidatePath('/admin');
}

export async function deleteAllArchivedAdsAction() {
  await requireAction('ads', 'delete');
  const arch = await prisma.ads.findMany({
    where: { NOT: [{ data_archive: null }, { data_archive: '' }] },
    select: { id: true },
  });
  const ids = arch.map((p) => p.id);
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    await prisma.photos.deleteMany({ where: { other_id: { in: slice } } }).catch(() => {});
    await prisma.ads.deleteMany({ where: { id: { in: slice } } }).catch(() => {});
  }
  revalidatePath('/admin/ads');
  revalidatePath('/admin');
}

/* ---- User view / edit / send-password ---- */
/** Admin credits or debits a member's wallet (رصيد). action=credit|debit. */
export async function adjustUserBalanceAction(formData: FormData) {
  const admin = await requireAction('users', 'edit');
  const uid = toInt(BigInt(String(formData.get('userId'))));
  const amount = Math.abs(parseInt(String(formData.get('amount') || '0')) || 0);
  const note = String(formData.get('note') || '').trim() || undefined;
  const kind = String(formData.get('kind') || 'credit');
  if (!uid || amount <= 0) redirect(`/admin/users/${uid}?error=${encodeURIComponent('أدخل مبلغاً صحيحاً')}`);
  const { creditUser, debitUser } = await import('@/lib/wallet');
  const r = kind === 'debit' ? await debitUser(uid, amount, admin.uid, note) : await creditUser(uid, amount, admin.uid, note);
  if (r.ok) await logAdmin(admin.uid, kind === 'debit' ? 'خصم رصيد' : 'إضافة رصيد', `العضو #${uid}`, `${amount} ر.س${note ? ` — ${note}` : ''}`);
  revalidatePath(`/admin/users/${uid}`);
  if (!r.ok) redirect(`/admin/users/${uid}?error=${encodeURIComponent('تعذّر التنفيذ (قد يكون الرصيد غير كافٍ للخصم)')}`);
  redirect(`/admin/users/${uid}?bal=1`);
}

export async function updateUserAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = BigInt(String(formData.get('userId')));
  const uid = toInt(id);
  const name = String(formData.get('name') || '').trim();
  const phoneRaw = String(formData.get('phoneNumber') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const data: { name?: string; phoneNumber?: string; email?: string | null } = {};
  if (name) data.name = name;
  if (phoneRaw) data.phoneNumber = toLocalSaudi(phoneRaw);
  data.email = email || null;
  await prisma.users.update({ where: { id }, data }).catch(() => {});
  revalidatePath(`/admin/users/${uid}`);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${uid}?saved=1`);
}

export async function sendUserPasswordAction(formData: FormData) {
  await requireAction('users', 'edit');
  const uid = Number(formData.get('userId'));
  const r = await sendNewPasswordToUser(uid);
  redirect(`/admin/users/${uid}?${r.ok ? 'sent=1' : 'error=' + encodeURIComponent(r.error || 'فشل الإرسال')}`);
}

/** رسالة رسمية من إدارة المتاجر لصاحب متجر — تصله في «الرسائل» باسم الإدارة مع تنبيه. */
export async function adminMessageStoreOwnerAction(formData: FormData) {
  const session = await requireAction('stores', 'edit');
  const storeId = Number(formData.get('storeId') || 0);
  const text = String(formData.get('message') || '').trim().slice(0, 1000);
  if (!storeId || !text) redirect('/admin/stores');
  const store = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { user_id: true, store_name: true } }).catch(() => null);
  if (!store) redirect('/admin/stores');
  await sendVerifyMessage(store.user_id, '__none__', `📢 رسالة رسمية من إدارة المتاجر بخصوص متجرك «${store.store_name || ''}»:\n${text}`);
  await logAdmin(session.uid, 'رسالة رسمية لتاجر', `متجر #${storeId}`, text.slice(0, 120));
  revalidatePath('/admin/stores');
  redirect('/admin/stores?msg=1');
}

/** موافقة الإدارة على طلب تغيير اسم العضو: يُطبَّق الاسم الجديد فوراً وتصل العضو رسالة. */
export async function approveNameRequestAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const id = BigInt(String(formData.get('id') || '0'));
  const r = await prisma.name_requests.findUnique({ where: { id } }).catch(() => null);
  if (!r || r.status !== 0) redirect('/admin/name-requests');
  if (r.kind === 'storeact') {
    // تعديل نشاط المتجر: الموافقة تطبّق النشاط الجديد على متجر العضو
    await prisma.stores.updateMany({ where: { user_id: toInt(r.user_id) }, data: { specialty: r.new_name } }).catch(() => {});
    await sendVerifyMessage(toInt(r.user_id), '__none__', `✅ وافقت إدارة المتاجر على تعديل نشاط متجرك إلى «${r.new_name}» — أصبح فعّالاً.`);
  } else if (r.kind === 'store') {
    // تعديل/استثناء اسم متجر: الموافقة تطبّق الاسم على متجر العضو
    await prisma.stores.updateMany({ where: { user_id: toInt(r.user_id) }, data: { store_name: r.new_name } }).catch(() => {});
    await sendVerifyMessage(toInt(r.user_id), '__none__', `✅ وافقت الإدارة على اسم متجرك «${r.new_name}» — أصبح فعّالاً.`);
  } else {
    await prisma.users.update({ where: { id: BigInt(r.user_id) }, data: { name: r.new_name } }).catch(() => {});
    await sendVerifyMessage(toInt(r.user_id), '__none__', `✅ تمت الموافقة على تغيير اسمك إلى «${r.new_name}» — الاسم الجديد أصبح فعّالاً.`);
  }
  await prisma.name_requests.update({ where: { id }, data: { status: 1, decided_at: new Date() } }).catch(() => {});
  await logAdmin(session.uid, r.kind === 'storeact' ? 'قبول تعديل نشاط متجر' : r.kind === 'store' ? 'قبول اسم متجر' : 'قبول تغيير اسم', `العضو #${toInt(r.user_id)}: «${r.old_name}» ← «${r.new_name}»`);
  revalidatePath('/admin/name-requests');
  redirect('/admin/name-requests?done=ok');
}

/** رفض طلب تغيير الاسم مع سبب يُحفظ ويصل العضو برسالة. */
export async function rejectNameRequestAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const id = BigInt(String(formData.get('id') || '0'));
  const note = String(formData.get('note') || '').trim().slice(0, 250);
  const r = await prisma.name_requests.findUnique({ where: { id } }).catch(() => null);
  if (!r || r.status !== 0) redirect('/admin/name-requests');
  await prisma.name_requests.update({ where: { id }, data: { status: 2, note: note || null, decided_at: new Date() } }).catch(() => {});
  await sendVerifyMessage(toInt(r.user_id), '__none__', r.kind === 'storeact'
    ? `❌ اعتذرت إدارة المتاجر عن تعديل نشاط متجرك إلى «${r.new_name}»${note ? ` — السبب: ${note}` : ''}. يبقى نشاطك الحالي كما هو.`
    : r.kind === 'store'
    ? `❌ اعتذرت الإدارة عن اسم متجرك «${r.new_name}»${note ? ` — السبب: ${note}` : ''}. اختر اسماً مختلفاً لمتجرك.`
    : `❌ اعتذرت الإدارة عن تغيير اسمك إلى «${r.new_name}»${note ? ` — السبب: ${note}` : ''}. يمكنك إرسال طلب جديد بمستند أوضح.`);
  await logAdmin(session.uid, r.kind === 'storeact' ? 'رفض تعديل نشاط متجر' : r.kind === 'store' ? 'رفض اسم متجر' : 'رفض تغيير اسم', `العضو #${toInt(r.user_id)}: «${r.new_name}»${note ? ` — ${note}` : ''}`);
  revalidatePath('/admin/name-requests');
  redirect('/admin/name-requests?done=rej');
}

export async function setUserPasswordAction(formData: FormData) {
  await requireAction('users', 'edit');
  const uid = Number(formData.get('userId'));
  const pass = String(formData.get('password') || '');
  if (pass.length < 4) redirect(`/admin/users/${uid}?error=${encodeURIComponent('كلمة المرور 4 خانات على الأقل')}`);
  await prisma.users.update({ where: { id: BigInt(uid) }, data: { password: await hashPassword(pass) } }).catch(() => {});
  redirect(`/admin/users/${uid}?setpass=1`);
}


/** إضافة حملة شحن مجدولة: تبدأ من تاريخ محدد وتستمر لمدة أيام محددة (بتوقيت السعودية). */
export async function addTopupCampaignAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const { getTopupCampaigns, setTopupCampaigns } = await import('@/lib/settings');
  const fromRaw = String(formData.get('from') || '').trim();
  const timeRaw = String(formData.get('fromTime') || '').trim();
  const fromTime = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : '00:00';
  // المدة فارغة أو 0 = حملة مفتوحة (بلا نهاية) تستمر حتى تُحذف
  const daysRaw = String(formData.get('days') ?? '').trim();
  const days = daysRaw === '' ? 0 : Math.max(0, Math.min(365, parseInt(daysRaw) || 0));
  // شرائح بحقول مفصولة: مبلغ الشحن + المكافأة (زوج لكل سطر، والفارغ يُتجاهل)
  const amounts = formData.getAll('tierAmount').map((v) => parseInt(String(v)) || 0);
  const bonuses = formData.getAll('tierBonus').map((v) => parseInt(String(v)) || 0);
  const tiers = amounts
    .map((amount, i) => ({ amount, bonus: bonuses[i] || 0 }))
    .filter((t) => t.amount > 0 && t.bonus > 0)
    .slice(0, 20);
  // تبدأ من التاريخ والوقت المحددين بتوقيت السعودية وتستمر «مدة» أيام كاملة بالدقيقة
  const from = new Date(`${fromRaw}T${fromTime}:00+03:00`);
  if (!fromRaw || isNaN(from.getTime()) || tiers.length === 0) {
    redirect('/admin/revenue?tab=campaigns&camp=err');
  }
  const toMs = days > 0 ? from.getTime() + days * 86400000 : Infinity; // مفتوحة = بلا نهاية
  const list = await getTopupCampaigns();
  // منع تداخل أوقات الحملات ولو بدقيقة: المفتوحة تشغل من بدايتها إلى ما لا نهاية
  const clash = list.find((c) => {
    const cFrom = new Date(c.from).getTime();
    const cTo = c.to ? new Date(c.to).getTime() : Infinity;
    return from.getTime() < cTo && toMs > cFrom;
  });
  if (clash) redirect('/admin/revenue?tab=campaigns&camp=overlap');
  const id = list.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  list.push({ id, from: from.toISOString(), to: days > 0 ? new Date(toMs).toISOString() : '', tiers });
  // فشل التخزين (مثلاً عمود قديم ضيق قبل الترقية) يظهر رسالة واضحة بدل صفحة خطأ
  let saved = true;
  try { await setTopupCampaigns(list.slice(-30)); } catch { saved = false; }
  // تحقق فعلي بعد الحفظ: هل الحملة الجديدة موجودة عند القراءة؟ (يكشف البتر الصامت)
  if (saved) {
    const check = await getTopupCampaigns();
    if (!check.some((c) => c.id === id)) saved = false;
  }
  if (!saved) redirect('/admin/revenue?tab=campaigns&camp=dberr');
  await logAdmin(session.uid, `إضافة حملة شحن (من ${fromRaw} ${fromTime} ${days > 0 ? `لمدة ${days} يوم` : 'مفتوحة'})`);
  revalidatePath('/admin/revenue');
  revalidatePath('/');
  redirect('/admin/revenue?tab=campaigns&camp=1');
}

/** حذف حملة شحن مجدولة. */
export async function deleteTopupCampaignAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const { getTopupCampaigns, setTopupCampaigns } = await import('@/lib/settings');
  const id = Number(formData.get('id') || 0);
  const list = (await getTopupCampaigns()).filter((c) => c.id !== id);
  await setTopupCampaigns(list);
  await logAdmin(session.uid, `حذف حملة شحن #${id}`);
  revalidatePath('/admin/revenue');
  revalidatePath('/');
  redirect('/admin/revenue?tab=campaigns&camp=del');
}

/** ربط حسابات أعضاء معاً (نفس المالك) — تبويب «ربط الأعضاء». الإدارة تنشئ الرابط فقط. */
export async function linkAccountsAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const raw = String(formData.get('userIds') || '');
  const ids = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length >= 2) {
    const { linkAccounts } = await import('@/lib/account-links');
    const r = await linkAccounts(ids, session.uid);
    if (r.ok) await logAdmin(session.uid, 'ربط حسابات أعضاء', ids.map((i) => `#${i}`).join(' + '));
  }
  revalidatePath('/admin/links');
}

/** فك ربط حساب من مجموعته. */
export async function unlinkAccountAction(formData: FormData) {
  const session = await requireAction('users', 'edit');
  const uid = Number(formData.get('userId') || 0);
  if (uid > 0) {
    const { unlinkAccount } = await import('@/lib/account-links');
    await unlinkAccount(uid);
    await logAdmin(session.uid, 'فك ربط حساب عضو', `#${uid}`);
  }
  revalidatePath('/admin/links');
}

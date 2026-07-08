'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAction, requireUserBan, setUserPerms, applyRolePreset, ALL_KEYS, setRolePermKeys, MATRIX_ROLES, type Role } from '@/lib/roles';
import { findDuplicateAds } from '@/lib/duplicates';
import { deleteClassified, setClassifiedStatus, setClassifiedLifetime } from '@/lib/classified';
import { adminDeleteMessage } from '@/lib/chat';
import { setStoreStatus, adminRequestHome, addStoreWarning, deleteStore, completeStoreTransfer, decidePlatformRequest } from '@/lib/merchant';
import { banUserFor, unbanUser } from '@/lib/moderation';
import { listDeletionRequests, closeDeletionRequest, findUserByPhone, deleteAccountNow } from '@/lib/account-delete';
import { addBannedWord, deleteBannedWord } from '@/lib/censor';
import { addGuardWord, deleteGuardWord, GUARD_CATEGORIES, type GuardCategory } from '@/lib/content-guard';
import { createPackage, updatePackage, deletePackage, assignUserPackage, type Tier } from '@/lib/packages';
import { setSetting, SETTING_AD_EDIT_HOURS, SETTING_AD_DELETE_HOURS, SETTING_MSG_DELETE_MINUTES, SETTING_HOME_STATS, HOME_STAT_KEYS, SETTING_CLASSIFIED_STATS, SETTING_CLASSIFIED_DAYS, SETTING_CLASSIFIED_SECONDS, SETTING_ADS_APPROVAL, SETTING_DUP_TITLE_PCT, SETTING_DUP_DETAIL_PCT, SETTING_DUP_IMAGE_PCT, SETTING_CDUP_ON, SETTING_CDUP_CONTENT_PCT, SETTING_CDUP_IMAGE_PCT, SETTING_CDUP_BG_PCT, SETTING_MSG_TPL_AD, SETTING_MSG_TPL_ADMIN, SETTING_AD_NOTICE, SETTING_TICKER, SETTING_HOME_CLS_TITLE, SETTING_HOME_CLS_SUB, SETTING_SUB_ENABLED, SETTING_SUB_MONTHLY, SETTING_SUB_6MO, SETTING_SUB_YEARLY, SETTING_SUB_GRACE_DAYS, SETTING_SUB_REMIND_DAYS, SETTING_SUB_REMIND_COUNT, SETTING_SUB_REMINDER_MSG, servicePriceKey, DURATIONS, type PaidService, APP_KEYS } from '@/lib/settings';
import { approvePromo, rejectPromo, deletePromo, createPromoPackage, updatePromoPackage, deletePromoPackage } from '@/lib/promos';
import { createBackup, restoreBackup, deleteBackup } from '@/lib/backup';
import { MSG_KEYS, toLocalSaudi, sendNewPasswordToUser } from '@/lib/sms';
import { hashPassword } from '@/lib/auth';
import { cacheDel } from '@/lib/redis';
import { bustAdCaches } from '@/lib/data';
import { toInt } from '@/lib/utils';

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
  revalidatePath('/admin/promos/packages');
  revalidatePath('/promote');
}
export async function updatePromoPackageAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await updatePromoPackage(id, readPromoPkgForm(formData));
  revalidatePath('/admin/promos/packages');
  revalidatePath('/promote');
}
export async function deletePromoPackageAction(formData: FormData) {
  await requireAction('promos', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePromoPackage(id);
  revalidatePath('/admin/promos/packages');
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
  revalidatePath('/admin/packages');
  revalidatePath('/packages');
}

export async function updatePackageAction(formData: FormData) {
  await requireAction('packages', 'edit');
  const id = Number(formData.get('id'));
  if (id) await updatePackage(id, readPackageForm(formData));
  revalidatePath('/admin/packages');
  revalidatePath('/packages');
}

export async function deletePackageAction(formData: FormData) {
  await requireAction('packages', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePackage(id);
  revalidatePath('/admin/packages');
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
  await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  const approve = String(formData.get('action')) === 'approve';
  if (id) await setStoreStatus(id, approve ? 1 : 2);
  revalidatePath('/admin/stores');
}

/** Admin asks an approved store to feature its products on the home page. */
export async function requestStoreHomeAction(formData: FormData) {
  await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  if (id) await adminRequestHome(id);
  revalidatePath('/admin/stores');
}

/** Suspend (stop) or reactivate a store. */
export async function toggleStoreStatusAction(formData: FormData) {
  await requireAction('stores', 'suspend');
  const id = Number(formData.get('storeId'));
  const suspend = String(formData.get('action')) === 'suspend';
  if (id) await setStoreStatus(id, suspend ? 2 : 1);
  revalidatePath('/admin/stores');
}

/** Issue a violation warning against a store (3 warnings → auto-suspend). */
export async function warnStoreAction(formData: FormData) {
  await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  const reason = String(formData.get('reason') || '').trim();
  if (id && reason) await addStoreWarning(id, reason);
  revalidatePath('/admin/stores');
}

/** Delete a store (store-scoped only; the owner's account and ads are untouched). */
export async function deleteStoreAction(formData: FormData) {
  await requireAction('stores', 'delete');
  const id = Number(formData.get('storeId'));
  if (id && formData.get('confirm')) await deleteStore(id);
  revalidatePath('/admin/stores');
}

/** Admin approves/rejects a merchant's request to feature products on Trbhh. */
export async function decidePlatformAction(formData: FormData) {
  await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  const approve = String(formData.get('action')) === 'approve';
  if (id) await decidePlatformRequest(id, approve);
  revalidatePath('/admin/stores');
}

/** Admin executes a mutually-consented ownership transfer (step 3). */
export async function completeStoreTransferAction(formData: FormData) {
  await requireAction('stores', 'edit');
  const id = Number(formData.get('storeId'));
  if (id && formData.get('confirm')) await completeStoreTransfer(id);
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
export async function adminDeleteAdRedirectAction(formData: FormData) {
  await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
  await prisma.ads.delete({ where: { id } }).catch(() => {});
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
      data: { status: archiving ? 0 : 1, data_archive: archiving ? new Date().toISOString() : null },
    }).catch(() => {});
  }
  revalidatePath(`/ads/${toInt(id)}`);
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
  await requireUserBan();
  const id = Number(formData.get('userId'));
  const permanent = !!formData.get('permanent');
  const days = Math.max(0, parseInt(String(formData.get('days') || '0')) || 0);
  await banUserFor(id, permanent ? 0 : days);
  revalidatePath('/admin/users');
}

/** Lift a member's ban. */
export async function unbanUserAction(formData: FormData) {
  await requireUserBan();
  const id = Number(formData.get('userId'));
  await unbanUser(id);
  revalidatePath('/admin/users');
}

/** Save a user's granular permissions from the permissions matrix (checkboxes named perm[]). */
export async function setUserPermsAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = Number(formData.get('userId'));
  if (!id) redirect('/admin/users');
  const keys = formData.getAll('perm').map((v) => String(v)).filter((k) => ALL_KEYS.includes(k));
  await setUserPerms(id, keys);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${id}/permissions?saved=1`);
}

/** Apply a quick role preset (manager/moderator/monitor/none) to a user. */
export async function applyPresetAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = Number(formData.get('userId'));
  const role = String(formData.get('role') || 'none') as Role | 'none';
  if (id) await applyRolePreset(id, role);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${id}/permissions?saved=1`);
}

/** Save the member self-service windows (edit/delete allowed period, hours). */
/** النصوص الظاهرة للزائر (تبويب مقسّم لأقسام) — يُحفَظ قسم واحد فقط في كل مرة. */
export async function saveTextsAction(formData: FormData) {
  await requireAction('users', 'edit');
  const sec = String(formData.get('sec') || 'general');
  const put = async (key: string, name: string) => setSetting(key, String(formData.get(name) ?? '').trim());
  if (sec === 'general') {
    await put(SETTING_TICKER, 'ticker');
  } else if (sec === 'home') {
    await put(SETTING_HOME_CLS_TITLE, 'homeClsTitle');
    await put(SETTING_HOME_CLS_SUB, 'homeClsSub');
  } else if (sec === 'ad') {
    await put(SETTING_AD_NOTICE, 'adNotice');
  } else if (sec === 'msg') {
    await put(SETTING_MSG_TPL_AD, 'msgTplAd');
    await put(SETTING_MSG_TPL_ADMIN, 'msgTplAdmin');
  } else if (sec === 'sub') {
    await put(SETTING_SUB_REMINDER_MSG, 'subReminderMsg');
  }
  revalidatePath('/admin/texts');
  revalidatePath('/', 'layout');
  redirect(`/admin/texts?sec=${sec}&saved=1`);
}

export async function saveSettingsAction(formData: FormData) {
  await requireAction('users', 'edit');
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
  await setSetting(SETTING_ADS_APPROVAL, adsApproval);
  await setSetting(SETTING_DUP_TITLE_PCT, String(dupTitle));
  await setSetting(SETTING_DUP_DETAIL_PCT, String(dupDetail));
  await setSetting(SETTING_DUP_IMAGE_PCT, String(dupImage));
  await setSetting(SETTING_AD_EDIT_HOURS, String(editH));
  await setSetting(SETTING_AD_DELETE_HOURS, String(delH));
  await setSetting(SETTING_MSG_DELETE_MINUTES, String(msgDelMin));
  await setSetting(SETTING_HOME_STATS, homeStats);
  await setSetting(SETTING_CLASSIFIED_STATS, classifiedStats);
  await setSetting(SETTING_CLASSIFIED_DAYS, String(classifiedDays));
  await setSetting(SETTING_CLASSIFIED_SECONDS, String(splashSeconds));
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
  revalidatePath('/admin/settings');
  revalidatePath('/');
  revalidatePath('/classified');
  redirect('/admin/settings?saved=1');
}

/** Revenue hub: store-subscription plans + grace, and ad-service/duplicate pricing. */
export async function saveRevenueAction(formData: FormData) {
  await requireAction('users', 'edit');
  const nn = (k: string, d = 0) => String(Math.max(0, parseInt(String(formData.get(k) || d)) || d));
  await setSetting(SETTING_SUB_ENABLED, formData.get('subEnabled') !== null ? '1' : '0');
  await setSetting(SETTING_SUB_MONTHLY, nn('subMonthly'));
  await setSetting(SETTING_SUB_6MO, nn('sub6mo'));
  await setSetting(SETTING_SUB_YEARLY, nn('subYearly'));
  await setSetting(SETTING_SUB_GRACE_DAYS, String(Math.max(0, parseInt(String(formData.get('subGraceDays') || '10')) || 10)));
  // تنبيهات قرب انتهاء الاشتراك: قبل كم يوم + كم مرة
  await setSetting(SETTING_SUB_REMIND_DAYS, nn('subRemindDays'));
  await setSetting(SETTING_SUB_REMIND_COUNT, nn('subRemindCount'));
  // مصفوفة تسعيرات الخدمات (خدمة × مدّة)
  const services: PaidService[] = ['featured', 'classified', 'dup3', 'dup5'];
  for (const s of services) {
    for (const d of DURATIONS) {
      const key = servicePriceKey(s, d.key);
      await setSetting(key, nn(key));
    }
  }
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

/** Save the permission matrix for one role (checkbox keys named "k"). */
export async function saveRolePermsAction(formData: FormData) {
  await requireAction('users', 'edit');
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
  await requireAction('verifications', 'edit');
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { trusted: u.trusted === 1 ? 0 : 1, step: 0 } });
  revalidatePath('/admin/users');
  revalidatePath('/admin/verifications');
}

export async function adminDeleteAdAction(formData: FormData) {
  await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } });
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/ads');
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
      data: { status: archiving ? 0 : 1, data_archive: archiving ? new Date().toISOString() : null },
    });
  }
  await bustAdCaches().catch(() => {}); // approved/hidden ad reflects immediately
  revalidatePath('/admin/ads');
  revalidatePath('/');
}

/** Delete ALL ads that are waiting for approval (status 0, not archived). */
export async function deleteAllPendingAdsAction() {
  await requireAction('ads', 'delete');
  const pend = await prisma.ads.findMany({
    where: { status: 0, OR: [{ data_archive: null }, { data_archive: '' }] },
    select: { id: true },
  });
  const ids = pend.map((p) => p.id);
  // Delete in chunks so a large backlog (1000+) never overflows the IN clause or times out.
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    await prisma.photos.deleteMany({ where: { other_id: { in: slice } } }).catch(() => {});
    await prisma.ads.deleteMany({ where: { id: { in: slice } } }).catch(() => {});
  }
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

async function refreshCategories() {
  await cacheDel('categories:active');
  revalidatePath('/admin/categories');
  revalidatePath('/');
}

export async function addCategoryAction(formData: FormData) {
  await requireAction('categories', 'add');
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const ordered = parseInt(String(formData.get('ordered') || '0')) || 0;
  await prisma.categories.create({ data: { name, photo_path: '0', is_active: 'yes', ordered } });
  await refreshCategories();
}

export async function toggleCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const c = await prisma.categories.findUnique({ where: { id } });
  if (c) await prisma.categories.update({ where: { id }, data: { is_active: c.is_active === 'yes' ? 'no' : 'yes' } });
  await refreshCategories();
}

export async function updateCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const name = String(formData.get('name') || '').trim();
  const ordered = parseInt(String(formData.get('ordered') || '0')) || 0;
  if (name) await prisma.categories.update({ where: { id }, data: { name, ordered } }).catch(() => {});
  await refreshCategories();
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAction('categories', 'delete');
  const id = BigInt(String(formData.get('catId')));
  await prisma.categories.delete({ where: { id } }).catch(() => {});
  await refreshCategories();
}

export async function moveCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const dir = String(formData.get('dir')); // 'up' | 'down'
  const cats = await prisma.categories.findMany({ orderBy: [{ ordered: 'desc' }, { id: 'desc' }], select: { id: true } });
  const ids = cats.map((c) => c.id);
  const idx = ids.findIndex((x) => x === id);
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (idx >= 0 && swap >= 0 && swap < ids.length) {
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    const n = ids.length;
    for (let i = 0; i < n; i++) await prisma.categories.update({ where: { id: ids[i] }, data: { ordered: n - i } }).catch(() => {});
  }
  await refreshCategories();
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

export async function setUserPasswordAction(formData: FormData) {
  await requireAction('users', 'edit');
  const uid = Number(formData.get('userId'));
  const pass = String(formData.get('password') || '');
  if (pass.length < 6) redirect(`/admin/users/${uid}?error=${encodeURIComponent('كلمة المرور 6 أحرف على الأقل')}`);
  await prisma.users.update({ where: { id: BigInt(uid) }, data: { password: await hashPassword(pass) } }).catch(() => {});
  redirect(`/admin/users/${uid}?setpass=1`);
}

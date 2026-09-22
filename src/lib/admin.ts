import 'server-only';
import { prisma } from './prisma';
import { findDuplicateAds } from './duplicates';
import { countClassifieds } from './classified';

/** Legacy facade; all authority is an explicit registered permission. */
export async function requireAdmin() {
  const {requireAccess}=await import('./access-control/guards');
  return requireAccess('dashboard','view');
}

export async function isAdmin(userId: number) {
  const {hasAccess}=await import('./access-control/guards');
  return hasAccess(userId,'dashboard','view');
}

export async function adminStats() {
  const [users, ads, activeAds, pendingAds, pendingVerify, reports, dup, classified, pendingNames] = await Promise.all([
    prisma.users.count(),
    prisma.ads.count(),
    prisma.ads.count({ where: { status: 1, state: 'active' } }),
    // "بانتظار الموافقة" = غير منشور (status 0) وغير مؤرشف وليس موقوفاً من صاحبه — نفس تعريف تبويب الإعلانات
    prisma.ads.count({ where: { status: 0, paused_by_owner: 0, OR: [{ data_archive: null }, { data_archive: '' }] } }),
    // توثيق معلّق = نفس تعريف تبويب «بانتظار الموافقة» في صفحة التوثيق: ليس موثقاً وليس مرفوضاً (step=2 يعني مرفوضاً)
    prisma.users.count({ where: { trusted: { not: 1 }, step: { not: 2 }, OR: [{ step: 1 }, { national_identity: { gt: 0 } }, { commercial_register: { gt: 0 } }, { work_permit: { gt: 0 } }] } }),
    prisma.repord_ads.count(),
    findDuplicateAds().then((r) => r.dupCount).catch(() => 0),
    countClassifieds().catch(() => 0),
    prisma.name_requests.count({ where: { status: 0 } }).catch(() => 0),
  ]);
  return { users, ads, activeAds, pendingAds, pendingVerify, reports, duplicateAds: dup, classified, pendingNames };
}

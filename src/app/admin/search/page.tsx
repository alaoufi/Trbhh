import Link from 'next/link';
import { Search, Users, Megaphone, Store, Sparkles, PanelsTopLeft } from 'lucide-react';
import { getUserPerms, requireAnyAdmin } from '@/lib/roles';
import { findAdminServices } from '@/lib/admin-service-search';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { AdminSearch } from '@/components/admin-search';
import { memberSearchSql, maskMemberPhone } from '@/lib/member-admin-search';
import { linkedAccountCounts } from '@/lib/account-links';
import { ensureSchema } from '@/data/schema-sync';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بحث الإدارة' };

// تبويبات صفحة «الإعلانات» في الإدارة — لتحديد مكان كل إعلان والانتقال إليه
const AD_TABS: Record<string, string> = {
  special: 'المميزة', normal: 'العادية', pending: 'بانتظار الموافقة',
  paused: 'موقوفة من أصحابها', archived: 'المؤرشفة',
};
function adTab(a: { status: number; paused_by_owner: number; adsSpecial: string; data_archive: string | null }): keyof typeof AD_TABS {
  if (a.data_archive) return 'archived';
  if (a.status === 0 && a.paused_by_owner === 1) return 'paused';
  if (a.status === 0) return 'pending';
  return a.adsSpecial === 'checked' ? 'special' : 'normal';
}

/** بحث الإدارة: يبحث في حقول الإدارة فقط، وكل نتيجة تعرض مكانها في الإدارة
 *  (الصفحة والتبويب) مع رابط الانتقال إليه، ومكان عرضها في صفحات الموقع. */
export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireAnyAdmin();
  await ensureSchema();
  const { q: qRaw } = await searchParams;
  const q = (qRaw || '').trim();
  const TAKE = 10;
  const permissions = await getUserPerms(session.uid);
  const services = q.length >= 2 ? findAdminServices(q, permissions) : [];

  type MemberRow = { id: bigint; name: string | null; userName: string | null; phoneNumber: string | null; ban: string | null };
  const memberWhere = memberSearchSql(q);
  const [users, ads, stores, classifieds] = q.length >= 2
    ? await Promise.all([
        prisma.$queryRawUnsafe<MemberRow[]>(
          `SELECT id, name, userName, phoneNumber, ban FROM users WHERE archived_at IS NULL AND (${memberWhere.sql}) ORDER BY id DESC LIMIT ${TAKE}`,
          ...memberWhere.args,
        ).catch(() => [] as MemberRow[]),
        prisma.ads.findMany({
          where: { OR: [{ title: { contains: q } }, ...(/^\d+$/.test(q) ? [{ id: BigInt(q) }] : [])] },
          select: { id: true, title: true, status: true, paused_by_owner: true, adsSpecial: true, data_archive: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
        prisma.stores.findMany({
          where: { OR: [{ store_name: { contains: q } }, { store_username: { contains: q } }] },
          select: { id: true, store_name: true, status: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
        prisma.classified_ads.findMany({
          where: { OR: [{ title: { contains: q } }, { body: { contains: q } }] },
          select: { id: true, title: true, body: true, status: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
      ])
    : [[], [], [], []];
  const linkedCounts = await linkedAccountCounts(users.map((u) => toInt(u.id)));

  const box = 'card-3d space-y-2 rounded-2xl p-3';
  const row = 'space-y-1 rounded-lg bg-secondary/30 px-2.5 py-2 text-sm';
  const chipAdmin = 'inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100';
  const chipSite = 'inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/10';
  const chipOff = 'inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground';

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">بحث الإدارة</h1>
      </div>
      <p className="text-xs text-muted-foreground">يبحث في بيانات الإدارة فقط: الأعضاء، الإعلانات، المتاجر، والإعلانات المبوّبة — وكل نتيجة تعرض مكانها في الإدارة (الصفحة والتبويب) ومكان عرضها في الموقع. بحث الموقع العام مستقل عنه.</p>
      <AdminSearch basePath="/admin/search" defaultValue={q} placeholder="ابحث باسم عضو أو جواله، عنوان إعلان أو رقمه، اسم متجر…" />

      {q.length >= 2 && (
        <>
          {services.length > 0 && <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><PanelsTopLeft className="h-4 w-4" /> الخدمات والإعدادات ({services.length})</div>
            {services.map((service) => (
              <Link key={service.href} href={service.href} className="block rounded-lg bg-primary/5 px-3 py-2.5 hover:bg-primary/10">
                <div className="font-bold text-primary">{service.label}</div>
                {service.description && <div className="mt-0.5 text-xs text-muted-foreground">{service.description}</div>}
                <div className="mt-1 text-[11px] font-bold text-primary/80">فتح الخدمة مباشرة ←</div>
              </Link>
            ))}
          </div>}
          {users.length > 0 && <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Users className="h-4 w-4" /> الأعضاء ({users.length})</div>
            {users.map((u) => (
              <div key={toInt(u.id)} className={row}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{u.name || u.userName}{u.ban === 'checked' && <span className="mr-1 text-[10px] font-bold text-red-600">· محظور</span>}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{maskMemberPhone(u.phoneNumber)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">عضو #{toInt(u.id)} · الحسابات الموحدة: {linkedCounts.get(toInt(u.id)) ?? 1}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/admin/users/${toInt(u.id)}`} className={chipAdmin}>📌 فتح ملف العضو</Link>
                  <Link href={`/admin/users/${toInt(u.id)}#wallet`} className={chipAdmin}>💳 فتح المحفظة</Link>
                  <Link href={`/users/${toInt(u.id)}`} className={chipSite}>🌐 في الموقع: صفحة العضو</Link>
                </div>
              </div>
            ))}
          </div>}

          {ads.length > 0 && <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Megaphone className="h-4 w-4" /> الإعلانات ({ads.length})</div>
            {ads.map((a) => {
              const t = adTab(a);
              const published = a.status === 1 && !a.data_archive;
              return (
                <div key={toInt(a.id)} className={row}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="line-clamp-1 font-bold">{a.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">#{toInt(a.id)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link href={`/admin/ads?view=${t}&q=${toInt(a.id)}`} className={chipAdmin}>📌 في الإدارة: الإعلانات ← تبويب «{AD_TABS[t]}»</Link>
                    {published
                      ? <Link href={`/ads/${toInt(a.id)}`} className={chipSite}>🌐 في الموقع: صفحة الإعلان (القوائم والبحث)</Link>
                      : <Link href={`/ads/${toInt(a.id)}`} className={chipOff}>🚫 لا يظهر للزوار — عرض صفحته (إدارة)</Link>}
                  </div>
                </div>
              );
            })}
          </div>}

          {stores.length > 0 && <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Store className="h-4 w-4" /> المتاجر ({stores.length})</div>
            {stores.map((s) => (
              <div key={toInt(s.id)} className={row}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{s.store_name || `متجر #${toInt(s.id)}`}</span>
                  <span className="text-xs text-muted-foreground">#{toInt(s.id)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href="/admin/stores" className={chipAdmin}>📌 في الإدارة: إدارة المتاجر ← بطاقة المتجر</Link>
                  {s.status === 1
                    ? <Link href={`/companies/${toInt(s.id)}`} className={chipSite}>🌐 في الموقع: صفحة المتجر ودليل المتاجر</Link>
                    : <span className={chipOff}>🚫 غير معتمد — لا يظهر في الموقع بعد</span>}
                </div>
              </div>
            ))}
          </div>}

          {classifieds.length > 0 && <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Sparkles className="h-4 w-4" /> الإعلانات المبوّبة ({classifieds.length})</div>
            {classifieds.map((c) => (
              <div key={toInt(c.id)} className={row}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="line-clamp-1 font-bold">{(c.title || c.body || '').slice(0, 80)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">#{toInt(c.id)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href="/admin/classified" className={chipAdmin}>📌 في الإدارة: الإعلانات المبوّبة</Link>
                  {c.status === 1
                    ? <Link href="/classified" className={chipSite}>🌐 في الموقع: صفحة المبوّبة وشاشة الافتتاح والرئيسية</Link>
                    : <span className={chipOff}>🚫 موقوف — لا يظهر في الموقع</span>}
                </div>
              </div>
            ))}
          </div>}

          {users.length + ads.length + stores.length + classifieds.length === 0 && (
            <p className="rounded-xl border border-primary/15 bg-accent/30 p-3 text-sm text-muted-foreground">لا نتائج مطابقة في بيانات الإدارة.</p>
          )}
        </>
      )}
      {q.length > 0 && q.length < 2 && <p className="text-xs text-muted-foreground">اكتب حرفين على الأقل.</p>}
    </div>
  );
}

import Link from 'next/link';
import { Search, Users, Megaphone, Store, Sparkles } from 'lucide-react';
import { requireAnyAdmin } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { AdminSearch } from '@/components/admin-search';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بحث الإدارة' };

/** بحث الإدارة: يبحث في حقول الإدارة فقط (الأعضاء والإعلانات والمتاجر والمبوّبة)
 *  — مستقل تماماً عن بحث الموقع العام. */
export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAnyAdmin();
  const { q: qRaw } = await searchParams;
  const q = (qRaw || '').trim();
  const TAKE = 10;

  const [users, ads, stores, classifieds] = q.length >= 2
    ? await Promise.all([
        prisma.users.findMany({
          where: { OR: [{ name: { contains: q } }, { userName: { contains: q } }, { phoneNumber: { contains: q } }] },
          select: { id: true, name: true, userName: true, phoneNumber: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
        prisma.ads.findMany({
          where: { OR: [{ title: { contains: q } }, ...(/^\d+$/.test(q) ? [{ id: BigInt(q) }] : [])] },
          select: { id: true, title: true, status: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
        prisma.stores.findMany({
          where: { OR: [{ store_name: { contains: q } }, { store_username: { contains: q } }] },
          select: { id: true, store_name: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
        prisma.classified_ads.findMany({
          where: { OR: [{ title: { contains: q } }, { body: { contains: q } }] },
          select: { id: true, title: true, body: true },
          orderBy: { id: 'desc' }, take: TAKE,
        }).catch(() => []),
      ])
    : [[], [], [], []];

  const box = 'card-3d space-y-1 rounded-2xl p-3';
  const row = 'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent';
  const empty = <p className="px-2 py-1 text-xs text-muted-foreground">لا نتائج.</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">بحث الإدارة</h1>
      </div>
      <p className="text-xs text-muted-foreground">يبحث في بيانات الإدارة فقط: الأعضاء، الإعلانات، المتاجر، والإعلانات المبوّبة — بحث الموقع العام مستقل عنه.</p>
      <AdminSearch basePath="/admin/search" defaultValue={q} placeholder="ابحث باسم عضو أو جواله، عنوان إعلان أو رقمه، اسم متجر…" />

      {q.length >= 2 && (
        <>
          <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Users className="h-4 w-4" /> الأعضاء ({users.length})</div>
            {users.length === 0 && empty}
            {users.map((u) => (
              <Link key={toInt(u.id)} href={`/admin/users?q=${encodeURIComponent(u.userName || u.name || '')}`} className={row}>
                <span className="font-medium">{u.name || u.userName}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber}</span>
              </Link>
            ))}
          </div>

          <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Megaphone className="h-4 w-4" /> الإعلانات ({ads.length})</div>
            {ads.length === 0 && empty}
            {ads.map((a) => (
              <Link key={toInt(a.id)} href={`/ads/${toInt(a.id)}`} className={row}>
                <span className="line-clamp-1 font-medium">{a.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">#{toInt(a.id)} {a.status === 1 ? '· منشور' : '· غير منشور'}</span>
              </Link>
            ))}
          </div>

          <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Store className="h-4 w-4" /> المتاجر ({stores.length})</div>
            {stores.length === 0 && empty}
            {stores.map((s) => (
              <Link key={toInt(s.id)} href={`/admin/stores?q=${encodeURIComponent(s.store_name || '')}`} className={row}>
                <span className="font-medium">{s.store_name || `متجر #${toInt(s.id)}`}</span>
                <span className="text-xs text-muted-foreground">#{toInt(s.id)}</span>
              </Link>
            ))}
          </div>

          <div className={box}>
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Sparkles className="h-4 w-4" /> الإعلانات المبوّبة ({classifieds.length})</div>
            {classifieds.length === 0 && empty}
            {classifieds.map((c) => (
              <Link key={toInt(c.id)} href="/admin/classified" className={row}>
                <span className="line-clamp-1 font-medium">{(c.title || c.body || '').slice(0, 80)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">#{toInt(c.id)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {q.length > 0 && q.length < 2 && <p className="text-xs text-muted-foreground">اكتب حرفين على الأقل.</p>}
    </div>
  );
}

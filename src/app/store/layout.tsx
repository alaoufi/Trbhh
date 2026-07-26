import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { getStoreMeta } from '@/lib/merchant';
import { mediaUrl } from '@/lib/media';
import { prisma } from '@/lib/prisma';
import { Store, ExternalLink, LogOut } from 'lucide-react';
import { ProfileSwitcher } from '@/components/profile-switcher';
import { getUserProfiles, getActiveProfile } from '@/lib/profiles';
import { linkedAccounts } from '@/lib/account-links';

export const dynamic = 'force-dynamic';

/**
 * Independent store-admin shell. A store is a self-contained site: this panel
 * carries the STORE's identity (name/logo/color) — not the Trbhh member menu.
 * The only link back to the platform is store oversight (إدارة المتاجر):
 * approval, suspend/delete, subscriptions, ownership transfer, product feature.
 * Trbhh chrome is hidden here by ChromeGate.
 */
export default async function StoreAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const store = await getStoreByUser(session.uid);
  const meta = store ? await getStoreMeta(store.id) : null;
  const name = meta?.storeName || 'متجري';
  const brand = /^#[0-9a-fA-F]{6}$/.test(meta?.color || '') ? meta!.color! : '#3287da';
  const logo = store?.logo ? mediaUrl((await prisma.uploads.findUnique({ where: { id: BigInt(store.logo) } }))?.file_name) : null;
  // مبدّل الهوية داخل لوحة المتجر: للرجوع لحساباتك أو التبديل لمتجر آخر
  const [profiles, active, linked] = await Promise.all([
    getUserProfiles(session.uid).catch(() => []),
    getActiveProfile(session.uid).catch(() => null),
    linkedAccounts(session.uid).catch(() => []),
  ]);
  const toItem = (p: { id: number; name: string; type: 'personal' | 'store'; avatarUrl: string; color: string | null }) => ({ id: p.id, name: p.name, type: p.type, avatarUrl: p.avatarUrl, color: p.color });
  const linkedItems = linked.filter((a) => a.id !== session.uid).map((a) => ({ id: a.id, name: a.name, hasStore: a.hasStore, storeName: a.storeName }));
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-white" style={{ background: brand }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={name} className="h-full w-full object-cover" />
            ) : (
              <Store className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold" style={{ color: brand }}>{name}</div>
            <div className="text-[11px] text-muted-foreground">لوحة إدارة المتجر</div>
          </div>
          {store && (
            <Link href={`/companies/${store.id}`} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: brand }}>
              <ExternalLink className="h-3.5 w-3.5" /> عرض المتجر
            </Link>
          )}
          {/* خروج: /logout معالج مسار (route handler) لا صفحة — يبقى <a> بتنقّل كامل
              لا <Link> (الاستباق كان سيُلغي الجلسة أثناء التصفّح). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/logout" className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold text-destructive">
            <LogOut className="h-3.5 w-3.5" /> خروج
          </a>
        </div>
      </header>
      {/* شريط التبديل: الرجوع للحساب أو التبديل لمتجر/هوية أخرى من داخل لوحة المتجر */}
      {active && (
        <div className="relative z-40 border-b bg-white/95">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-1.5">
            <ProfileSwitcher active={toItem(active)} profiles={profiles.map(toItem)} linked={linkedItems} />
            <span className="text-[11px] text-muted-foreground">بدّل بين حساباتك ومتاجرك</span>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-3xl px-3 py-4">{children}</main>
    </div>
  );
}

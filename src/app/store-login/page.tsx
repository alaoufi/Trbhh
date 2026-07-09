import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { Store, LogIn, Home } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { getStore } from '@/lib/stores';
import { getStoreMeta, storeIdByHandle } from '@/lib/merchant';
import { isLightColor } from '@/lib/store-style';
import { storeLoginAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'دخول المتاجر' };

/** Resolve the store this login belongs to — from ?s= (handle/id) or the subdomain host. */
async function resolveStore(sParam: string) {
  let sid = 0;
  const s = sParam.trim();
  if (s) sid = /^\d+$/.test(s) ? Number(s) : await storeIdByHandle(s).catch(() => 0);
  if (!sid) {
    const host = ((await headers()).get('host') || '').toLowerCase().replace(/\.$/, '');
    if (host.endsWith('.' + SITE.domain) && host !== SITE.domain) {
      const label = host.slice(0, -('.' + SITE.domain).length);
      if (label && !label.includes('.') && label !== 'www') sid = await storeIdByHandle(label).catch(() => 0);
    }
  }
  if (!sid) return null;
  const store = await getStore(sid).catch(() => null);
  if (!store) return null;
  const meta = await getStoreMeta(sid).catch(() => null);
  return { id: sid, name: meta?.storeName || store.name, brand: (meta?.color && /^#[0-9a-fA-F]{6}$/.test(meta.color)) ? meta.color : '#3287da', logo: store.logo };
}

/**
 * دخول المتجر — بهوية المتجر ولونه، لكن البيانات موحّدة مع تربح (رقم الجوال
 * وكلمة المرور نفسها): الدخول من هنا أو من تربح يفتح كليهما بجلسة واحدة.
 */
export default async function StoreLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; s?: string }> }) {
  const { error, s } = await searchParams;
  const store = await resolveStore(s || '');
  const brand = store?.brand || '#3287da';
  const onBrand = isLightColor(brand) ? '#0f172a' : '#ffffff';
  const field = 'h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-bold outline-none focus:ring-2';

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6" style={{ background: `linear-gradient(160deg, ${brand}14, transparent 60%)` }}>
      {store ? (
        <span className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border-4 border-white shadow-lg" style={{ background: brand }}>
          <Image src={store.logo} alt={store.name} fill sizes="64px" className="object-cover" />
        </span>
      ) : (
        <span className="grid h-16 w-16 place-items-center rounded-2xl text-white" style={{ background: brand }}><Store className="h-8 w-8" /></span>
      )}

      <div className="text-center">
        <h1 className="text-xl font-extrabold" style={{ color: brand }}>
          {store ? <>الدخول على متجر {store.name}</> : 'دخول المتاجر'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          بيانات الدخول موحّدة مع تربح: رقم الجوال وكلمة المرور نفسها — دخولك هنا يفتح تربح ومتجرك معاً.
        </p>
      </div>

      {error === '1' && (
        <div className="w-full rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center text-sm font-bold text-red-700">
          بيانات الدخول غير صحيحة.
        </div>
      )}

      <form action={storeLoginAction} className="w-full space-y-3">
        {s ? <input type="hidden" name="s" value={s} /> : null}
        <input name="identifier" type="tel" required dir="ltr" inputMode="tel" autoComplete="tel" placeholder="رقم الجوال (05xxxxxxxx)" className={`${field} text-left`} style={{ borderColor: `${brand}40` }} />
        <input name="password" type="password" required autoComplete="current-password" placeholder="كلمة المرور" className={field} style={{ borderColor: `${brand}40` }} />
        <button className="btn-3d flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-extrabold" style={{ background: brand, color: onBrand }}>
          <LogIn className="h-4 w-4" /> {store ? `دخول متجر ${store.name}` : 'دخول المتجر'}
        </button>
      </form>

      <Link href="/forgot" className="text-sm font-bold underline" style={{ color: brand }}>نسيت كلمة المرور؟</Link>

      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:underline">
        <Home className="h-3.5 w-3.5" /> الرجوع لتربح
      </Link>
    </div>
  );
}

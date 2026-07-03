import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BadgeCheck, MapPin, Phone, MessageCircle, Building2, Users, Star, Store, Heart, Home } from 'lucide-react';
import { getStore } from '@/lib/stores';
import { getMyAds } from '@/lib/account';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { getStoreMeta, followersCount, getStoreRating, getStoreReviews, isFollowing, storeIdOfUser, isCollaborator, collaboratorAds } from '@/lib/merchant';
import { AdGrid } from '@/components/ad-card';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { waLink } from '@/lib/classified-theme';
import { bannerBackground } from '@/lib/store-style';
import { timeAgo } from '@/lib/utils';
import { followStoreAction, rateStoreAction, sendCollabAction } from '../actions';
import { Handshake } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getStore(Number(id));
  const meta = s ? await getStoreMeta(s.id) : null;
  return { title: meta?.storeName || s?.name || 'متجر' };
}

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-4 w-4 ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />)}
    </span>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storeId = Number(id);
  const s = await getStore(storeId);
  if (!s) notFound();

  const session = await getSession().catch(() => null);
  const isOwner = !!session && s.userId === session.uid;
  const admin = session ? await hasAnyAdmin(session.uid).catch(() => false) : false;
  const meta = await getStoreMeta(storeId);
  // approval gate: pending/suspended stores are visible only to the owner and admins
  if (meta.status !== 1 && !isOwner && !admin) notFound();

  const [myAds, followers, rating, reviews, following] = await Promise.all([
    getMyAds(s.userId),
    followersCount(storeId),
    getStoreRating(storeId),
    getStoreReviews(storeId),
    session && !isOwner ? isFollowing(session.uid, storeId) : Promise.resolve(false),
  ]);
  const active = myAds.filter((a) => a.status === 1).map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special, views: 0, sellerName: null, sellerTrusted: false }));
  const wa = waLink(s.whatsapp);
  // collaboration: can this viewer (a merchant) invite this store?
  const viewerStoreId = session && !isOwner ? await storeIdOfUser(session.uid) : 0;
  const alreadyPartner = viewerStoreId ? await isCollaborator(viewerStoreId, storeId) : false;
  const canInvite = viewerStoreId > 0 && viewerStoreId !== storeId && !alreadyPartner;
  const partnerAds = await collaboratorAds(storeId).catch(() => []);
  const brand = meta.color || '#3287da';
  const name = meta.storeName || s.name;

  return (
    <div className="space-y-4">
      {/* شريط تنقّل: العودة للرئيسية + إدارة المتجر لصاحبه */}
      <div className="flex items-center justify-between gap-2">
        <a href="/" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold text-primary hover:bg-accent">
          <Home className="h-4 w-4" /> الصفحة الرئيسية
        </a>
        {isOwner && (
          <a href="/account/company" className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">
            <Store className="h-4 w-4" /> إدارة متجري
          </a>
        )}
      </div>

      {meta.status !== 1 && (isOwner || admin) && (
        <div className="card-3d rounded-xl p-3 text-sm font-bold text-amber-700">⏳ هذا المتجر {meta.status === 0 ? 'بانتظار موافقة الإدارة' : 'موقوف'} — يظهر لك فقط حالياً.</div>
      )}

      {/* رأس المتجر بهويته البصرية (نمط البانر + اللون) */}
      <div className="card-3d overflow-hidden rounded-2xl">
        <div className="relative h-32 w-full" style={{ background: bannerBackground(meta.banner, brand) }}>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-muted shadow-lg"><Image src={s.logo} alt={name} fill sizes="80px" className="object-cover" /></div>
            <div className="min-w-0 pb-1 text-white drop-shadow">
              <div className="flex items-center gap-1 text-xl font-extrabold">{name}{s.trusted && <BadgeCheck className="h-5 w-5" />}</div>
              {meta.tagline && <div className="truncate text-sm opacity-95">{meta.tagline}</div>}
            </div>
          </div>
        </div>
        <div className="p-5">
          {s.address && <div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{s.address}</div>}

          {/* إحصائيات: متابعون · تقييم · إعلانات */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-secondary/40 p-2"><div className="flex items-center justify-center gap-1 font-bold" style={{ color: brand }}><Users className="h-4 w-4" /> {en(followers)}</div><div className="text-[11px] text-muted-foreground">متابع</div></div>
            <div className="rounded-xl bg-secondary/40 p-2"><div className="flex items-center justify-center gap-1 font-bold" style={{ color: brand }}><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {rating.count ? rating.avg : '—'}</div><div className="text-[11px] text-muted-foreground">تقييم ({en(rating.count)})</div></div>
            <div className="rounded-xl bg-secondary/40 p-2"><div className="font-bold" style={{ color: brand }}>{en(active.length)}</div><div className="text-[11px] text-muted-foreground">إعلان</div></div>
          </div>

          {/* أزرار: متابعة + تواصل */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!isOwner && (
              <form action={followStoreAction}>
                <input type="hidden" name="storeId" value={storeId} />
                <button className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold ${following ? 'border-2 text-white' : 'text-white'}`} style={{ background: following ? '#64748b' : brand }}>
                  <Heart className={`h-4 w-4 ${following ? 'fill-white' : ''}`} /> {following ? 'متابَع ✓' : 'متابعة'}
                </button>
              </form>
            )}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button variant="whatsapp"><MessageCircle className="h-4 w-4" /> واتساب</Button></a>}
            {s.phone && <a href={`tel:${s.phone}`}><Button variant="outline"><Phone className="h-4 w-4" /> اتصال</Button></a>}
            {canInvite && (
              <form action={sendCollabAction}>
                <input type="hidden" name="toStore" value={storeId} />
                <Button variant="outline"><Handshake className="h-4 w-4" /> دعوة للتعاون</Button>
              </form>
            )}
            {alreadyPartner && <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"><Handshake className="h-4 w-4" /> شريك متعاون</span>}
          </div>

          {(meta.about || s.description) && <p className="mt-4 whitespace-pre-line leading-7 text-foreground/90">{meta.about || s.description}</p>}
        </div>
      </div>

      {s.branches.length > 0 && (
        <div className="card-3d rounded-xl p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold"><Building2 className="h-4 w-4" /> الفروع</h2>
          <ul className="space-y-1 text-sm">
            {s.branches.map((b) => <li key={b.id} className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" /> <b>{b.name}</b> {b.address && <span className="text-muted-foreground">— {b.address}</span>}</li>)}
          </ul>
        </div>
      )}

      <h2 className="text-lg font-bold" style={{ color: brand }}>كتالوج المتجر ({en(active.length)})</h2>
      <AdGrid ads={active} />

      {partnerAds.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: brand }}><Handshake className="h-5 w-5" /> منتجات شركائنا</h2>
          <AdGrid ads={partnerAds} />
        </>
      )}

      {/* التقييمات وملاحظات العملاء */}
      <div className="card-3d space-y-3 rounded-2xl p-4">
        <h2 className="flex items-center gap-2 font-bold" style={{ color: brand }}><Star className="h-5 w-5" /> تقييمات العملاء ({en(rating.count)})</h2>
        {session && !isOwner && (
          <form action={rateStoreAction} className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <input type="hidden" name="storeId" value={storeId} />
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold">تقييمك:</span>
              <select name="star" defaultValue="5" className="h-9 rounded-lg border bg-white px-2 text-sm">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
              </select>
            </div>
            <textarea name="note" rows={2} maxLength={500} placeholder="ملاحظتك عن المتجر (اختياري)" className="w-full rounded-lg border bg-white p-2 text-sm" />
            <button className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: brand }}>إرسال التقييم</button>
          </form>
        )}
        {reviews.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد.</p>}
        {reviews.map((r) => (
          <div key={r.id} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-primary">{r.author}</span>
              <span className="flex items-center gap-2"><Stars value={r.star} /> <span className="text-xs text-muted-foreground">{timeAgo(r.at)}</span></span>
            </div>
            {r.note && <p className="mt-1 text-sm text-foreground/90">{r.note}</p>}
          </div>
        ))}
      </div>

      <DisclaimerBar />
    </div>
  );
}

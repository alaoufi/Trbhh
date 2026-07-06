import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { getStoreMeta, followersCount, getStoreRating, incomingOffers, collaboratorStoreIds, storeCard, getStoreWarnings, storeProductAdIds, pendingTransferForOwner, platformRequestState } from '@/lib/merchant';
import { getMyAds } from '@/lib/account';
import { StoreDesigner } from '@/components/store-designer';
import { StoreMiniCard } from '@/components/store-mini-card';
import { CopyLink } from '@/components/copy-link';
import { respondOfferAction, respondTransferAction } from '@/app/companies/actions';
import { setStoreProductsAction, requestPlatformAction } from './actions';
import { Palette, Handshake, Home, PackageOpen, UserCog, Globe, Megaphone } from 'lucide-react';
import { mediaUrl } from '@/lib/media';
import { SITE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { saveCompanyAction, addBranchAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'شركتي' };

export default async function ManageCompanyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await requireUser();
  const store = await getStoreByUser(session.uid);
  const branches = store ? await prisma.store_branches.findMany({ where: { store_id: store.id } }) : [];
  const logoUrl = store?.logo ? mediaUrl((await prisma.uploads.findUnique({ where: { id: BigInt(store.logo) } }))?.file_name) : null;
  const meta = store ? await getStoreMeta(store.id) : null;
  const stats = store
    ? { followers: await followersCount(store.id), rating: await getStoreRating(store.id), ads: await prisma.ads.count({ where: { user_id: BigInt(session.uid), status: 1 } }) }
    : null;
  const offers = store ? await incomingOffers(store.id) : [];
  const collabIds = store ? await collaboratorStoreIds(store.id) : [];
  const collabs = store ? (await Promise.all(collabIds.map((id) => storeCard(id)))).filter(Boolean) : [];
  const warnings = store ? await getStoreWarnings(store.id) : [];
  // independent catalog: the owner picks which of their ads appear in the store
  const myActiveAds = store ? (await getMyAds(session.uid)).filter((a) => a.status === 1) : [];
  const inStore = new Set(store ? await storeProductAdIds(store.id) : []);
  const pendingTransfer = store ? await pendingTransferForOwner(session.uid) : null;
  const platformState = store ? await platformRequestState(store.id) : 'none';
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d); };
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const field = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">متجري</h1>
        {store && <Link href={`/companies/${store.id}`} className="text-sm text-primary hover:underline">عرض صفحة المتجر</Link>}
      </div>

      {error === 'terms' && (
        <div className="card-3d rounded-xl border-2 border-destructive/40 p-3 text-sm font-bold text-destructive">
          يجب الموافقة على شروط المتجر وتحمّل مسؤولية المنتجات قبل فتح المتجر.
        </div>
      )}

      {store && meta && (
        <div className={`card-3d rounded-xl p-3 text-sm font-bold ${meta.status === 1 ? 'text-emerald-700' : meta.status === 0 ? 'text-amber-700' : 'text-red-700'}`}>
          {meta.status === 1 ? '✓ متجرك مُعتمَد وظاهر للجميع.' : meta.status === 0 ? '⏳ متجرك بانتظار موافقة الإدارة قبل الظهور.' : '⛔ متجرك موقوف. تواصل مع الإدارة.'}
        </div>
      )}

      {/* تعهّد الشروط الموثّق (نسخة لدى العضو ونسخة لدى الإدارة) */}
      {store && meta?.termsAgreed && (
        <div className="card-3d rounded-xl p-3 text-sm">
          <div className="font-bold text-emerald-700">📄 تعهّدك موثّق</div>
          <p className="mt-1 text-muted-foreground">وافقت على <Link href="/store-terms" target="_blank" className="font-bold text-primary underline">الشروط والأحكام وسياسة الخصوصية</Link> وتحمّل مسؤولية منتجاتك{meta.termsAgreedAt ? ` بتاريخ ${fmtDate(meta.termsAgreedAt)}` : ''}. (صفحة مقروءة غير قابلة للتعديل، نسخة محفوظة لديك ونسخة لدى إدارة متاجر تربّح).</p>
        </div>
      )}

      {/* إنذارات المخالفة الموجّهة للمتجر */}
      {store && warnings.length > 0 && (
        <div className="card-3d rounded-xl border-2 border-red-200 bg-red-50/50 p-3 text-sm">
          <div className="font-bold text-red-700">⚠️ إنذارات ({en(warnings.length)}/3) — عند بلوغ ٣ يُوقف المتجر</div>
          <ul className="mt-1 space-y-1 text-foreground/80">
            {warnings.map((w) => <li key={w.id} className="flex justify-between gap-2"><span>• {w.reason || 'مخالفة'}</span><span className="shrink-0 text-xs text-muted-foreground">{w.at ? fmtDate(w.at) : ''}</span></li>)}
          </ul>
        </div>
      )}

      {store && stats && (
        <div className="grid grid-cols-3 gap-2">
          {[{ l: 'متابعون', v: en(stats.followers) }, { l: 'التقييم', v: stats.rating.count ? `${stats.rating.avg}★` : '—' }, { l: 'إعلانات نشطة', v: en(stats.ads) }].map((s) => (
            <div key={s.l} className="card-3d flex flex-col items-center gap-0.5 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-primary">{s.v}</div><div className="text-[11px] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {store && <CopyLink url={`https://${SITE.domain}/companies/${store.id}`} />}

      {/* الرابط المستقل للمتجر (نطاق فرعي) */}
      {store && meta?.handle && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Globe className="h-5 w-5" /> رابط متجرك المستقل</div>
          <CopyLink url={`https://${meta.handle}.${SITE.domain}`} label="النطاق الفرعي للمتجر" />
          <p className="text-xs text-muted-foreground">يعمل النطاق الفرعي فور تفعيل إعداد النطاق على الخادم. حتى ذلك الحين يعمل الرابط المختصر <b dir="ltr">{SITE.domain}/companies/{store.id}</b>.</p>
        </div>
      )}

      {/* طلب عرض المنتجات في منصة تربح — يعتمده مراقب المتاجر (إعلان المتجر يظهر تلقائياً) */}
      {store && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Megaphone className="h-5 w-5" /> عرض منتجاتي في منصة تربح</div>
          <p className="text-xs text-muted-foreground">إعلان متجرك يظهر في تربح تلقائياً بعد الاعتماد. أمّا عرض <b>منتجاتك</b> في صفحة تربح فيحتاج طلباً تعتمده إدارة المتاجر.</p>
          {platformState === 'approved' ? (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">✓ منتجاتك معتمدة للعرض في منصة تربح.</div>
          ) : platformState === 'pending' ? (
            <div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-700">⏳ طلبك قيد المراجعة لدى إدارة المتاجر.</div>
          ) : (
            <form action={requestPlatformAction}>
              <Button size="sm"><Megaphone className="h-4 w-4" /> إرسال طلب عرض المنتجات</Button>
            </form>
          )}
        </div>
      )}

      {/* طلب نقل ملكية وارد — يحتاج موافقة الصاحب الأول قبل تنفيذ الإدارة */}
      {store && pendingTransfer && (
        <div className="card-3d space-y-2 rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2 font-bold text-amber-700"><UserCog className="h-5 w-5" /> طلب نقل ملكية المتجر</div>
          <p className="text-sm text-foreground/80">
            العضو <b>{pendingTransfer.toName}</b>{pendingTransfer.toPhone ? <> (<span dir="ltr">{pendingTransfer.toPhone}</span>)</> : null} يطلب نقل ملكية متجرك إليه.
            بموافقتك ينتقل المتجر بكامل معلوماته (الاسم والجوال والبريد) بعد تنفيذ الإدارة، وتعود أنت عضواً عادياً.
          </p>
          <div className="flex gap-2">
            <form action={respondTransferAction}><input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="action" value="accept" /><button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white">أوافق على النقل</button></form>
            <form action={respondTransferAction}><input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="action" value="reject" /><button className="rounded-lg border border-destructive/40 px-4 py-1.5 text-xs font-bold text-destructive">رفض</button></form>
          </div>
        </div>
      )}

      {/* منتجات المتجر — المتجر مستقل: يعرض فقط ما تختاره هنا، لا كل إعلاناتك */}
      {store && (
        <form action={setStoreProductsAction} className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><PackageOpen className="h-5 w-5" /> منتجات المتجر</div>
          <p className="text-xs text-muted-foreground">المتجر مستقل تماماً: اختر الإعلانات التي تريد عرضها في متجرك. الإعلانات غير المحدّدة لا تظهر في المتجر.</p>
          {myActiveAds.length === 0 ? (
            <p className="rounded-xl bg-secondary/30 p-3 text-sm text-muted-foreground">لا توجد لديك إعلانات نشطة لعرضها. أضف إعلاناً أولاً ثم اختره هنا.</p>
          ) : (
            <>
              <div className="grid max-h-80 gap-1.5 overflow-y-auto">
                {myActiveAds.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                    <input type="checkbox" name="productIds" value={a.id} defaultChecked={inStore.has(a.id)} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                    <span className="truncate">{a.title || `إعلان #${a.id}`}</span>
                    <span className="mr-auto shrink-0 text-xs text-muted-foreground">{a.adsType === 'request' ? 'طلب' : 'عرض'}</span>
                  </label>
                ))}
              </div>
              <Button size="sm">حفظ منتجات المتجر</Button>
            </>
          )}
        </form>
      )}

      {store && offers.length > 0 && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Handshake className="h-5 w-5" /> دعوات واردة</div>
          {offers.map((o) => (
            <div key={o.id} className="space-y-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                {o.kind === 'home' ? <><Home className="h-4 w-4" /> طلب من الإدارة بعرض منتجاتك في الصفحة الرئيسية</> : <><Handshake className="h-4 w-4" /> دعوة تعاون لعرض المنتجات المتبادل</>}
              </div>
              {o.from && <StoreMiniCard s={o.from} />}
              <div className="flex gap-2">
                <form action={respondOfferAction}><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="action" value="accept" /><button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white">قبول</button></form>
                <form action={respondOfferAction}><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="action" value="reject" /><button className="rounded-lg border border-destructive/40 px-4 py-1.5 text-xs font-bold text-destructive">رفض</button></form>
              </div>
            </div>
          ))}
        </div>
      )}

      {store && collabs.length > 0 && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Handshake className="h-5 w-5" /> شركاء متجرك ({collabs.length})</div>
          {collabs.map((c) => c && <StoreMiniCard key={c.id} s={c} href={`/companies/${c.id}`} />)}
        </div>
      )}

      <form action={saveCompanyAction} className="max-w-lg space-y-4 card-3d rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><Palette className="h-5 w-5" /> مصمّم المتجر الذكي</div>
        <StoreDesigner initial={{ storeName: meta?.storeName, color: meta?.color, banner: meta?.banner, tagline: meta?.tagline, about: meta?.about, layout: meta?.layout, catalog: meta?.catalog, fields: meta?.fields, handle: meta?.handle, logoUrl }} />
        <div><label className="mb-1 block text-sm font-medium">شعار المتجر (صورة)</label><input name="logo" type="file" accept="image/*" className="w-full rounded-lg border bg-background p-2 text-sm" /></div>

        {/* بيانات النشاط التجاري */}
        <div className="space-y-3 rounded-xl border-2 border-primary/15 bg-secondary/20 p-3">
          <div className="text-sm font-extrabold text-primary">بيانات النشاط التجاري</div>
          <div>
            <label className="mb-1 block text-sm font-medium">تخصّص المتجر</label>
            <input name="specialty" defaultValue={meta?.specialty ?? ''} maxLength={120} className={field} placeholder="مثال: إلكترونيات ومستلزمات الجوّال" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الطبقة المستهدفة</label>
            <input name="audience" defaultValue={meta?.audience ?? ''} maxLength={160} className={field} placeholder="مثال: أصحاب المشاريع الصغيرة والأفراد" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">تاريخ مزاولة النشاط <span className="text-muted-foreground">(اختياري)</span></label>
            <input name="since" type="date" defaultValue={meta?.since ?? ''} className={field} />
          </div>
        </div>

        {/* بيانات التواصل والهوية */}
        <div className="space-y-3 rounded-xl border-2 border-primary/15 bg-secondary/20 p-3">
          <div className="text-sm font-extrabold text-primary">بيانات التواصل والهوية</div>
          <div>
            <label className="mb-1 block text-sm font-medium">رقم الهوية / السجل التجاري <span className="text-muted-foreground">(سرّي — للإدارة فقط)</span></label>
            <input name="nationalId" defaultValue={meta?.nationalId ?? ''} maxLength={30} inputMode="numeric" className={field} placeholder="10xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">رقم الجوال</label>
            <input name="phone" defaultValue={meta?.phone ?? ''} maxLength={24} inputMode="tel" dir="ltr" className={field} placeholder="05xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
            <input name="email" type="email" defaultValue={meta?.email ?? ''} maxLength={120} dir="ltr" className={field} placeholder="store@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">وسائل تواصل أخرى <span className="text-muted-foreground">(اختياري)</span></label>
            <input name="contacts" defaultValue={meta?.contacts ?? ''} maxLength={500} dir="ltr" className={field} placeholder="واتساب / تويتر / موقع إلكتروني ..." />
          </div>
        </div>

        <div><label className="mb-1 block text-sm font-medium">وصف النشاط / ملف الأعمال</label><textarea name="description" defaultValue={store?.description ?? ''} rows={4} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="نبذة عن نشاط المتجر والخدمات المقدمة" /></div>
        <div><label className="mb-1 block text-sm font-medium">العنوان</label><input name="address" defaultValue={store?.address ?? ''} className={field} /></div>

        {/* الموافقة على شروط المتجر — إلزامية عند فتح متجر جديد */}
        {!store && (
          <label className="flex items-start gap-2 rounded-xl border-2 border-primary/25 bg-primary/5 p-3 text-sm">
            <input type="checkbox" name="agreeTerms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span>أتعهّد بالموافقة على <Link href="/store-terms" target="_blank" className="font-bold text-primary underline">الشروط والأحكام وسياسة الخصوصية</Link> وأتحمّل كامل مسؤولية منتجاتي وصحّة بياناتي.</span>
          </label>
        )}

        <Button>{store ? 'حفظ المتجر' : 'إنشاء المتجر'}</Button>
      </form>

      {store && (
        <div className="max-w-lg space-y-3 card-3d rounded-xl p-5">
          <h2 className="font-bold">الفروع</h2>
          <ul className="space-y-1 text-sm">
            {branches.map((b) => <li key={toInt(b.id)}>• {b.name} {b.address && <span className="text-muted-foreground">— {b.address}</span>}</li>)}
            {branches.length === 0 && <li className="text-muted-foreground">لا توجد فروع بعد.</li>}
          </ul>
          <form action={addBranchAction} className="flex flex-wrap gap-2">
            <input name="name" required placeholder="اسم الفرع" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
            <input name="address" placeholder="العنوان" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
            <Button size="sm">إضافة فرع</Button>
          </form>
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';
import { Store, Check, X, Home, ShieldAlert, Pause, Play, Users, Star, Megaphone, Phone, Mail, Link2, IdCard, CalendarDays, FileCheck2, AlertTriangle, UserCog } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getPendingStores, adminStoreList, approvedTransfers, platformRequests, type AdminStore } from '@/lib/merchant';
import { getStoresCommsLog, type StoreComm } from '@/lib/audit';
import { timeAgo } from '@/lib/utils';
import { approveStoreAction, requestStoreHomeAction, toggleStoreStatusAction, warnStoreAction, completeStoreTransferAction, decidePlatformAction, grantStoreDaysAction, adminMessageStoreOwnerAction, approveVerifyOrderAction, rejectVerifyOrderAction, cancelVerifyOrderAction, storeUntrustAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { AdminSearch } from '@/components/admin-search';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة المتاجر' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
const STATUS: Record<number, { label: string; cls: string }> = {
  1: { label: 'معتمد', cls: 'bg-emerald-100 text-emerald-700' },
  0: { label: 'بانتظار الاعتماد', cls: 'bg-amber-100 text-amber-700' },
  2: { label: 'موقوف مؤقتاً', cls: 'bg-red-100 text-red-700' },
  3: { label: 'موقوف نهائياً', cls: 'bg-red-200 text-red-800' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d);
}

const COMM_META: Record<StoreComm['kind'], { icon: string; label: string; cls: string }> = {
  warn: { icon: '⚠️', label: 'إنذار مخالفة', cls: 'text-red-700' },
  adhide: { icon: '🚫', label: 'إخفاء إعلان + إنذار', cls: 'text-red-700' },
  message: { icon: '✉️', label: 'رسالة رسمية', cls: 'text-sky-700' },
};

function StoreCard({ s, comms = [] }: { s: AdminStore; comms?: StoreComm[] }) {
  const st = STATUS[s.status] || STATUS[1];
  const warns = s.warnings.length;
  return (
    <div className="card-3d space-y-3 rounded-2xl p-4">
      {/* الرأس */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/companies/${s.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold text-primary">{s.storeName || `متجر #${s.id}`}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
            {warns > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700"><AlertTriangle className="h-3 w-3" /> {en(warns)}/3 إنذار</span>}
          </div>
          <div className="text-xs text-muted-foreground">التاجر: {s.ownerName} · فُتح {timeAgo(s.createdAt)}</div>
        </Link>
      </div>

      {/* 📅 تدقيق التواريخ والمميزات: متى فُتح، متى وُثّق صاحبه، وما المدفوع/الممنوح ومتى ينتهي */}
      <div className="grid gap-1.5 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs sm:grid-cols-2">
        <div><span className="text-muted-foreground">📅 تاريخ فتح المتجر: </span><b>{fmtDate(s.createdAt) || '—'}</b></div>
        <div>
          <span className="text-muted-foreground">✅ توثيق صاحب المتجر: </span>
          {s.ownerTrusted
            ? <b className="text-emerald-700">موثّق{s.ownerVerifiedAt ? ` منذ ${fmtDate(s.ownerVerifiedAt)}` : ' (قديم — بلا تاريخ مسجّل)'}</b>
            : <b className="text-muted-foreground">غير موثّق</b>}
          {s.ownerTrusted && (
            <details className="mt-1 rounded-lg border border-slate-300 bg-white">
              <summary className="cursor-pointer list-none px-2 py-1 text-[11px] font-bold text-slate-700">↩ إلغاء توثيق المتجر (علامة التوثيق فقط — بسبب)…</summary>
              <form action={storeUntrustAction} className="flex items-center gap-1 border-t border-slate-200 p-1.5">
                <input type="hidden" name="userId" value={s.userId} />
                <input name="reason" required maxLength={300} placeholder="سبب الإلغاء (إلزامي — يصل صاحب المتجر)" className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none" />
                <ConfirmSubmit msg="تأكيد إلغاء توثيق المتجر؟ تُسحب علامة «موثّق» فقط — المتجر وإعلاناته لا تتأثر إطلاقاً، ويصل صاحبه السبب، والمدفوع يُسترد له غير المستخدم تلقائياً." className="shrink-0 rounded-lg bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-white">إلغاء التوثيق</ConfirmSubmit>
              </form>
            </details>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">💳 اشتراك المتجر: </span>
          {s.subUntil
            ? <b className={new Date(s.subUntil) > new Date() ? 'text-emerald-700' : 'text-red-600'}>{s.onTrial ? 'تجربة ' : ''}حتى {fmtDate(s.subUntil)}{new Date(s.subUntil) > new Date() ? '' : ' (منتهٍ)'}</b>
            : <b className="text-muted-foreground">لا اشتراك مسجّل</b>}
        </div>
        <div>
          <span className="text-muted-foreground">🏠 العرض في رئيسية تربح: </span>
          {s.homeFeatured
            ? <b className="text-amber-700">بقرار إداري (مجاني دائم)</b>
            : s.showUntil
              ? <b className={new Date(s.showUntil) > new Date() ? 'text-emerald-700' : 'text-red-600'}>مدفوع حتى {fmtDate(s.showUntil)}{new Date(s.showUntil) > new Date() ? '' : ' (منتهٍ)'}</b>
              : <b className="text-muted-foreground">غير معروض</b>}
        </div>
        <div className="sm:col-span-2 text-[11px] text-muted-foreground">من وافق ومتى؟ كل قرارات الاعتماد والتوثيق والمنح والعرض تُسجَّل باسم صاحب الصلاحية في <Link href="/admin/audit" className="font-bold text-primary underline">سجل النشاط</Link>.</div>
      </div>

      {/* المعلومات الكاملة */}
      <div className="grid gap-1.5 rounded-xl bg-secondary/30 p-3 text-xs sm:grid-cols-2">
        {s.specialty && <div><span className="text-muted-foreground">التخصّص: </span><b>{s.specialty}</b></div>}
        {s.audience && <div><span className="text-muted-foreground">الطبقة المستهدفة: </span><b>{s.audience}</b></div>}
        <div className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> مزاولة النشاط: <b>{s.since || '—'}</b></div>
        <div className="flex items-center gap-1"><IdCard className="h-3.5 w-3.5 text-muted-foreground" /> الهوية/السجل: <b dir="ltr">{s.nationalId || '—'}</b></div>
        <div className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> الجوال: <b dir="ltr">{s.phone || '—'}</b></div>
        <div className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> البريد: <b dir="ltr">{s.email || '—'}</b></div>
        {s.contacts && <div className="flex items-center gap-1 sm:col-span-2"><Link2 className="h-3.5 w-3.5 text-muted-foreground" /> وسائل تواصل: <b dir="ltr" className="truncate">{s.contacts}</b></div>}
      </div>

      {/* النشاط والإحصائيات */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-secondary/40 p-2"><div className="flex items-center justify-center gap-1 font-bold text-primary"><Users className="h-4 w-4" /> {en(s.followers)}</div><div className="text-[10px] text-muted-foreground">متابع</div></div>
        <div className="rounded-xl bg-secondary/40 p-2"><div className="flex items-center justify-center gap-1 font-bold text-primary"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {s.ratingCount ? s.ratingAvg : '—'}</div><div className="text-[10px] text-muted-foreground">تقييم ({en(s.ratingCount)})</div></div>
        <div className="rounded-xl bg-secondary/40 p-2"><div className="flex items-center justify-center gap-1 font-bold text-primary"><Megaphone className="h-4 w-4" /> {en(s.adsCount)}</div><div className="text-[10px] text-muted-foreground">إعلان نشط</div></div>
      </div>

      {/* تعهّد الشروط */}
      <div className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold ${s.termsAgreed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        <FileCheck2 className="h-4 w-4 shrink-0" />
        {s.termsAgreed ? <>وقّع التعهّد بالموافقة على الشروط والأحكام والخصوصية بتاريخ {fmtDate(s.termsAgreedAt)}</> : 'لم يوقّع التعهّد بعد'}
        <Link href="/store-terms" target="_blank" className="mr-auto underline">عرض التعهّد</Link>
      </div>

      {/* عدّاد الإنذارات (نحو الإيقاف عند ٣) */}
      {warns > 0 && (
        <div className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-bold text-red-700">
          <ShieldAlert className="h-4 w-4" /> إنذارات المخالفة: {en(warns)}/3 {warns >= 3 && '— أُوقف المتجر تلقائياً'}
        </div>
      )}

      {/* 📋 سجل الرسائل والإنذارات المرسلة للمتجر من الإدارة — مع اسم المُرسِل */}
      <details className="rounded-xl border border-primary/15 bg-secondary/20 p-2.5">
        <summary className="cursor-pointer text-xs font-bold text-primary">📋 سجل الرسائل والإنذارات من الإدارة ({en(comms.length)})</summary>
        {comms.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">لم تُرسل الإدارة أي رسالة أو إنذار لهذا المتجر بعد.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {comms.map((c) => {
              const m = COMM_META[c.kind];
              return (
                <li key={c.id} className="rounded-lg bg-white/70 p-2 text-[11px] leading-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-bold ${m.cls}`}>{m.icon} {m.label}</span>
                    <span className="shrink-0 text-muted-foreground">{timeAgo(c.at)}</span>
                  </div>
                  {c.text && <div className="mt-0.5 text-foreground/80">«{c.text}»</div>}
                  <div className="mt-0.5 text-muted-foreground">أرسلها: <b className="text-foreground/70">{c.adminName}</b></div>
                </li>
              );
            })}
          </ul>
        )}
      </details>

      {/* الإجراءات */}
      <div className="flex flex-wrap items-center gap-2">
        {s.status === 0 && (
          <>
            <form action={approveStoreAction}><input type="hidden" name="storeId" value={s.id} /><input type="hidden" name="action" value="approve" /><ConfirmSubmit msg="تأكيد اعتماد هذا المتجر؟ سيُفعَّل ويصل صاحبه إشعار." className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" /> اعتماد</ConfirmSubmit></form>
            <form action={approveStoreAction}><input type="hidden" name="storeId" value={s.id} /><input type="hidden" name="action" value="reject" /><ConfirmSubmit msg="تأكيد رفض طلب هذا المتجر؟" className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive"><X className="h-3.5 w-3.5" /> رفض</ConfirmSubmit></form>
          </>
        )}
        {s.status === 1 && (
          <>
            <form action={toggleStoreStatusAction}><input type="hidden" name="storeId" value={s.id} /><input type="hidden" name="action" value="suspend" /><ConfirmSubmit msg="إيقاف مؤقت لهذا المتجر؟ يختفي متجره ومنتجاته ويُمنع النشر منه — من يفتحه يرى «المتجر غير نشط حالياً، أعد المحاولة لاحقاً» حتى إعادة التفعيل." className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white"><Pause className="h-3.5 w-3.5" /> إيقاف مؤقت</ConfirmSubmit></form>
            <form action={toggleStoreStatusAction}><input type="hidden" name="storeId" value={s.id} /><input type="hidden" name="action" value="suspend_perm" /><ConfirmSubmit msg="إيقاف نهائي لهذا المتجر؟ يُمنع النشر والتصفّح — من يفتحه يرى «لا يوجد متجر نشط بهذا الاسم». يمكن إعادة تفعيله لاحقاً من هنا." className="flex items-center gap-1 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white"><Pause className="h-3.5 w-3.5" /> إيقاف نهائي</ConfirmSubmit></form>
            <form action={requestStoreHomeAction}><input type="hidden" name="storeId" value={s.id} /><button className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white"><Home className="h-3.5 w-3.5" /> اطلب للرئيسية</button></form>
          </>
        )}
        {(s.status === 2 || s.status === 3) && (
          <form action={toggleStoreStatusAction}><input type="hidden" name="storeId" value={s.id} /><input type="hidden" name="action" value="activate" /><ConfirmSubmit msg="تأكيد إعادة تفعيل هذا المتجر؟ يعود للظهور فوراً." className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Play className="h-3.5 w-3.5" /> إعادة تفعيل</ConfirmSubmit></form>
        )}
      </div>

      {/* منح أيام مجانية (تمديد التجربة أو تعويض) */}
      <form action={grantStoreDaysAction} className="flex items-center gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-2">
        <input type="hidden" name="storeId" value={s.id} />
        <span className="shrink-0 text-xs font-bold text-indigo-700">🎁 منح أيام:</span>
        <input name="days" type="number" min={1} required placeholder="عدد الأيام" className="h-9 w-28 min-w-0 rounded-lg border bg-white px-2 text-xs outline-none" />
        <ConfirmSubmit msg="تأكيد منح الأيام المدخلة لهذا المتجر مجاناً؟" className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">منح / تمديد التجربة</ConfirmSubmit>
      </form>

      {/* إنذار مخالفة منتجات */}
      <form action={warnStoreAction} className="flex items-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50/40 p-2">
        <input type="hidden" name="storeId" value={s.id} />
        <input name="reason" required maxLength={300} placeholder="سبب الإنذار (منتج مخالف…)" className="h-9 min-w-0 flex-1 rounded-lg border bg-white px-2 text-xs outline-none" />
        <ConfirmSubmit msg="تأكيد تسجيل إنذار على هذا المتجر بالسبب المكتوب؟ يُحفظ في سجله ويصل صاحبه." className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"><ShieldAlert className="h-3.5 w-3.5" /> إنذار</ConfirmSubmit>
      </form>

      {/* ✉️ رسالة رسمية من إدارة المتاجر لصاحب المتجر — تصله في «الرسائل» باسم الإدارة */}
      <form action={adminMessageStoreOwnerAction} className="flex items-center gap-2 rounded-xl border-2 border-sky-200 bg-sky-50/40 p-2">
        <input type="hidden" name="storeId" value={s.id} />
        <input name="message" required maxLength={1000} placeholder="✉️ رسالة رسمية من إدارة المتاجر لصاحب المتجر…" className="h-9 min-w-0 flex-1 rounded-lg border bg-white px-2 text-xs outline-none" />
        <button className="flex shrink-0 items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">إرسال رسمي</button>
      </form>

    </div>
  );
}

export default async function AdminStores({ searchParams }: { searchParams: Promise<{ msg?: string; vbal?: string; q?: string }> }) {
  await requireAction('stores', 'view');
  const { msg, vbal, q } = await searchParams;
  const term = (q || '').trim();
  const [pending, stores, transfers, platformReqs, commsByStore] = await Promise.all([getPendingStores(), adminStoreList(), approvedTransfers(), platformRequests(), getStoresCommsLog().catch(() => new Map<number, StoreComm[]>())]);
  const { listVerifyOrdersAdmin, refundOf } = await import('@/lib/verify-paid');
  const verifyOrders = await listVerifyOrdersAdmin().catch(() => ({ pending: [], active: [] }));
  const verifyPkgs = await import('@/lib/settings').then((m) => m.getVerifyPackages()).catch(() => []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Store className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">إدارة المتاجر</h1></div>
      {msg === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ أُرسلت الرسالة الرسمية لصاحب المتجر — تصله في «الرسائل» باسم الإدارة مع تنبيه.</div>}
      <p className="text-sm text-muted-foreground">معلومات كاملة عن كل متجر ونشاطه، مع الاعتماد والإيقاف والإنذار من المنتجات المخالفة. عند تكرار الإنذارات ٣ مرات يُوقف المتجر تلقائياً وتبقى الإنذارات موثّقة.</p>

      {vbal === '1' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 وافقت لكن رصيد العضو لا يغطي رسوم التوثيق — بقي الطلب معلقاً ووصلت العضو رسالة بشحن رصيده؛ أعد الموافقة بعد الشحن.</div>}

      {/* ⭐ التوثيق المدفوع: ظاهر دائماً — حالة الباقات + الطلبات المعلقة والنشطة */}
      <div className="rounded-2xl border-2 border-sky-300 bg-sky-50/40 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 font-bold text-sky-700">
          ⭐ التوثيق المدفوع — طلبات معلقة ({en(verifyOrders.pending.length)}) ونشطة ({en(verifyOrders.active.length)})
          <span className="mr-auto flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            {verifyPkgs.length > 0
              ? verifyPkgs.map((pkg) => <span key={pkg.idx} className="rounded-full bg-white px-2 py-0.5 text-sky-800 shadow-sm">باقة {pkg.idx}: {en(pkg.fee)} ر.س / {en(pkg.days)} يوم</span>)
              : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">⚠ الخدمة معطلة — كل الباقات برسوم 0</span>}
            <Link href="/admin/revenue?tab=pricing" className="rounded-full border border-sky-400 bg-white px-2 py-0.5 text-sky-700 underline">تعديل الباقات ←</Link>
          </span>
        </div>
        {verifyOrders.pending.length === 0 && verifyOrders.active.length === 0 && (
          <p className="text-xs font-bold text-muted-foreground">لا توجد طلبات توثيق حالياً — يطلبها صاحب المتجر من لوحة متجره (قسم «الظهور في تربح» ← بطاقة «⭐ توثيق المتجر») باختيار باقة والموافقة على التعهد، فتظهر هنا للموافقة (خصم وتفعيل) أو الرفض بسبب.</p>
        )}
        {(verifyOrders.pending.length > 0 || verifyOrders.active.length > 0) && (
          <div className="space-y-2">
            {verifyOrders.pending.map((o) => (
              <div key={o.id} className="space-y-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/companies/${o.storeId}`} className="font-bold text-primary">{o.storeName || `متجر #${o.storeId}`}</Link>
                  <Link href={`/users/${o.userId}`} className="text-xs font-bold text-muted-foreground underline">{o.userName}</Link>
                  <span className="text-xs text-muted-foreground">طلب {timeAgo(o.at)}</span>
                  <span className="mr-auto rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-extrabold text-sky-800">{en(o.fee)} ر.س / {en(o.days)} يوم</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${o.balance >= o.fee ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>رصيده: {en(o.balance)} ر.س {o.balance >= o.fee ? '✓ يكفي' : '✗ لا يكفي'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={approveVerifyOrderAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <ConfirmSubmit msg={`تأكيد الموافقة على توثيق «${o.storeName || o.userName}»؟ سيُخصم ${o.fee} ر.س من رصيده فوراً ويُفعَّل التوثيق ${o.days} يوماً — إن لم يكفِ رصيده يبقى الطلب معلقاً ويُبلَّغ بالشحن.`} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" /> موافقة وخصم وتفعيل</ConfirmSubmit>
                  </form>
                  <form action={rejectVerifyOrderAction} className="flex min-w-0 flex-1 items-center gap-1">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="note" required maxLength={300} placeholder="سبب الرفض (إلزامي — يصل العضو)" className="h-8 min-w-0 flex-1 rounded-lg border border-destructive/30 bg-white px-2 text-xs outline-none" />
                    <ConfirmSubmit msg="تأكيد رفض طلب التوثيق؟ لا يُخصم شيء ويصل العضو السبب." className="flex shrink-0 items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive"><X className="h-3.5 w-3.5" /> رفض</ConfirmSubmit>
                  </form>
                </div>
              </div>
            ))}
            {verifyOrders.active.map((o) => { const rf = refundOf(o); return (
              <div key={o.id} className="space-y-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/companies/${o.storeId}`} className="font-bold text-primary">{o.storeName || `متجر #${o.storeId}`}</Link>
                  <Link href={`/users/${o.userId}`} className="text-xs font-bold text-muted-foreground underline">{o.userName}</Link>
                  <span className="mr-auto rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800">✅ موثّق حتى {fmtDate(o.expiresAt)} (باقي {en(rf.remainingDays)} يوم)</span>
                </div>
                <details className="rounded-lg border border-slate-300">
                  <summary className="cursor-pointer list-none px-3 py-1.5 text-xs font-bold text-slate-700">↩ إلغاء التوثيق (بسبب) — يُعاد له {en(rf.refund)} ر.س قيمة الأيام غير المستخدمة…</summary>
                  <form action={cancelVerifyOrderAction} className="flex items-center gap-1 border-t border-slate-200 p-2">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="reason" required maxLength={300} placeholder="سبب الإلغاء (إلزامي — يصل العضو)" className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none" />
                    <ConfirmSubmit msg={`تأكيد إلغاء التوثيق؟ تُسحب الشارة فوراً ويُعاد لرصيد العضو ${rf.refund} ر.س (${rf.remainingDays} يوم غير مستخدم من ${o.days}).`} className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white">إلغاء واسترداد</ConfirmSubmit>
                  </form>
                </details>
              </div>
            ); })}
          </div>
        )}
      </div>

      {/* طلبات عرض المنتجات في منصة تربح — إعلان المتجر يظهر تلقائياً، والمنتجات بموافقة */}
      {platformReqs.length > 0 && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-3">
          <div className="mb-2 flex items-center gap-2 font-bold text-emerald-700"><Megaphone className="h-5 w-5" /> طلبات عرض المنتجات في منصة تربح ({en(platformReqs.length)})</div>
          <div className="space-y-2">
            {platformReqs.map((r) => (
              <div key={r.storeId} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <Link href={`/companies/${r.storeId}`} className="min-w-0 flex-1">
                  <div className="font-bold text-primary">{r.storeName || `متجر #${r.storeId}`}</div>
                  <div className="text-xs text-muted-foreground">التاجر: {r.ownerName} · طلب {timeAgo(r.at)}</div>
                </Link>
                <form action={decidePlatformAction}><input type="hidden" name="storeId" value={r.storeId} /><input type="hidden" name="action" value="approve" /><ConfirmSubmit msg="تأكيد اعتماد عرض منتجات هذا المتجر في تربح؟" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" /> اعتماد العرض</ConfirmSubmit></form>
                <form action={decidePlatformAction}><input type="hidden" name="storeId" value={r.storeId} /><input type="hidden" name="action" value="reject" /><ConfirmSubmit msg="تأكيد رفض طلب عرض المنتجات؟" className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive"><X className="h-3.5 w-3.5" /> رفض</ConfirmSubmit></form>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* نقل الملكية — بعد طلب المنقول له وموافقة الصاحب الأول، تنفّذ الإدارة النقل */}
      {transfers.length > 0 && (
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 font-bold text-primary"><UserCog className="h-5 w-5" /> طلبات نقل ملكية بموافقة الطرفين ({en(transfers.length)})</div>
          <div className="space-y-2">
            {transfers.map((tr) => (
              <div key={tr.storeId} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-primary">{tr.storeName || `متجر #${tr.storeId}`}</div>
                  <div className="text-xs text-muted-foreground">
                    من <b>{tr.fromName}</b> ← إلى <b>{tr.toName}</b>{tr.toPhone ? <> (<span dir="ltr">{tr.toPhone}</span>)</> : null} · وافق المالك {timeAgo(tr.at)}
                  </div>
                </div>
                <form action={completeStoreTransferAction} className="flex items-center gap-2">
                  <input type="hidden" name="storeId" value={tr.storeId} />
                  <label className="flex items-center gap-1 text-[11px] font-bold text-primary"><input type="checkbox" name="confirm" required className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" /> أؤكّد</label>
                  <ConfirmSubmit msg="تأكيد تنفيذ نقل ملكية المتجر للعضو الجديد؟ لا يمكن التراجع." className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white"><UserCog className="h-3.5 w-3.5" /> تنفيذ النقل</ConfirmSubmit>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-3">
          <div className="mb-1 flex items-center gap-2 font-bold text-amber-700"><ShieldAlert className="h-5 w-5" /> بانتظار الاعتماد ({en(pending.length)})</div>
          <p className="text-xs text-muted-foreground">راجع بيانات المتجر ونشاطه أدناه قبل الاعتماد.</p>
        </div>
      )}

      {/* بحث المتاجر بالاسم أو الرقم */}
      <AdminSearch basePath="/admin/stores" defaultValue={term} placeholder="بحث عن متجر بالاسم أو رقمه…" />
      {(() => {
        const shown = term ? stores.filter((s) => (s.storeName || '').includes(term) || String(s.id) === term) : stores;
        return (
          <>
            {shown.length === 0 && <p className="py-8 text-center text-muted-foreground">{term ? `لا توجد متاجر مطابقة لـ «${term}».` : 'لا توجد متاجر بعد.'}</p>}
            <div className="space-y-3">
              {shown.map((s) => <StoreCard key={s.id} s={s} comms={commsByStore.get(s.id) || []} />)}
            </div>
          </>
        );
      })()}
    </div>
  );
}

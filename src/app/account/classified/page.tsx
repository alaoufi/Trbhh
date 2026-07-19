import Link from 'next/link';
import { Sparkles, Pencil, Trash2, Plus, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyClassifieds } from '@/lib/classified';
import { getClassifiedLifetimeDays, getServicePricing, serviceHasPrice, DURATIONS } from '@/lib/settings';
import { getBalance } from '@/lib/wallet';
import { ClassifiedCard } from '@/components/classified-card';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { deleteMyClassifiedAction, reactivateClassifiedAction } from '@/app/classified/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي المبوّبة' };

function isExpired(expiresAt: string | null, createdAt: string | null, days: number): boolean {
  if (expiresAt) return new Date(expiresAt).getTime() < Date.now(); // per-ad paid period
  if (!days || !createdAt) return false;
  return (Date.now() - new Date(createdAt).getTime()) / 86400000 > days;
}

export default async function MyClassifiedPage({ searchParams }: { searchParams: Promise<{ updated?: string; deleted?: string; error?: string; reactivated?: string; price?: string; bal?: string }> }) {
  const session = await requireUser();
  const [items, sp, lifeDays, pricing, balance] = await Promise.all([getMyClassifieds(session.uid), searchParams, getClassifiedLifetimeDays(), getServicePricing(), getBalance(session.uid)]);
  const classifiedSold = serviceHasPrice(pricing.classified);
  const pricedDurations = DURATIONS.filter((d) => pricing.classified[d.key] > 0);
  const affordableDurations = pricedDurations.filter((d) => pricing.classified[d.key] <= balance);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">إعلاناتي المبوّبة ({items.length})</h1>
        </div>
        <Link href="/classified/new" className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> إعلان جديد
        </Link>
      </div>

      {sp.updated === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم حفظ التعديلات.</div>}
      {sp.deleted === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم حذف الإعلان.</div>}
      {sp.reactivated === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تمت إعادة تفعيل الإعلان وعاد للعرض.</div>}
      {sp.error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي لإعادة التفعيل{sp.price ? ` (المطلوب ${sp.price} ر.س)` : ''}. راجع <Link href="/account/wallet" className="underline">محفظتي</Link>.</div>}
      {sp.error === 'deleteWindow' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">انتهت المدة المسموح بها لحذف الإعلان حسب إعدادات الموقع. للحذف تواصل مع الإدارة.</div>}
      {sp.error === 'banned' && <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">🚫 تم حظر حسابك بعد تكرار نشر نفس الإعلان المبوّب.</div>}
      {classifiedSold && <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">رصيدك: <b className="text-primary">{balance} ر.س</b>. الإعلان المبوّب يظهر طوال المدّة المدفوعة، وبعد انتهائها يُحفظ في الأرشيف ويمكنك إعادة تفعيله متى شئت.</div>}

      {items.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">لا توجد لديك إعلانات مبوّبة بعد.</p>
          <Link href="/classified/new" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">صمّم أول إعلان</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <div className="relative">
                <ClassifiedCard c={c} float={false} />
                {isExpired(c.expiresAt, c.createdAt, lifeDays) && (
                  <span className="absolute right-2 top-2 z-10 rounded-full bg-slate-800/85 px-2 py-0.5 text-[11px] font-medium text-white">في الأرشيف</span>
                )}
              </div>
              {classifiedSold && isExpired(c.expiresAt, c.createdAt, lifeDays) && (
                pricedDurations.length > 0 && affordableDurations.length === 0 ? (
                  <Link href="/account/wallet" className="flex items-center justify-center gap-1 rounded-lg border-2 border-red-400 bg-red-50 py-1.5 text-[11px] font-bold text-red-700">
                    💳 رصيدك لا يكفي — اشحن رصيدك
                  </Link>
                ) : (
                  <form action={reactivateClassifiedAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="duration" defaultValue={affordableDurations[0]?.key} className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-1 text-[11px]">
                      {pricedDurations.map((d) => (
                        <option key={d.key} value={d.key} disabled={pricing.classified[d.key] > balance}>{d.label} — {pricing.classified[d.key]} ر.س{pricing.classified[d.key] > balance ? ' (غير متاح)' : ''}</option>
                      ))}
                    </select>
                    <ConfirmSubmit msg="تأكيد إعادة تفعيل المبوّب للمدة المختارة؟ سيُخصم السعر من رصيدك." className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-white"><RefreshCw className="h-3 w-3" /> تفعيل</ConfirmSubmit>
                  </form>
                )
              )}
              <div className="flex gap-1.5">
                <Link href={`/classified/${c.id}/edit`} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-primary/30 py-1.5 text-xs font-medium text-primary hover:bg-accent">
                  <Pencil className="h-3.5 w-3.5" /> تعديل
                </Link>
                <form action={deleteMyClassifiedAction} className="flex-1">
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit msg="حذف هذا الإعلان المبوّب نهائياً؟ لا يمكن التراجع." className="flex w-full items-center justify-center gap-1 rounded-lg border border-destructive/30 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" /> حذف
                  </ConfirmSubmit>
                </form>
              </div>
              {c.link && (
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-3 w-3" /> الرابط
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

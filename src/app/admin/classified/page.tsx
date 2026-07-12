import { Sparkles, Trash2, ExternalLink, Play, Pause, Timer, Settings } from 'lucide-react';
import Link from 'next/link';
import { getAllClassifieds, type AdminClassified } from '@/lib/classified';
import { CLASSIFIED_THEMES } from '@/lib/classified-theme';
import { getClassifiedLifetimeDays } from '@/lib/settings';
import { timeAgo } from '@/lib/utils';
import { requirePerm } from '@/lib/roles';
import { adminDeleteClassifiedAction, toggleClassifiedAction, classifiedLifetimeAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الإعلانات المبوّبة' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
const fmtDate = (d: Date) => new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d);

/** Effective expiry: the ad's own expires_at, else the global window from its creation. */
function effectiveExpiry(c: AdminClassified, globalDays: number): Date | null {
  if (c.expiresAt) return new Date(c.expiresAt);
  if (globalDays > 0 && c.createdAt) return new Date(new Date(c.createdAt).getTime() + globalDays * 86_400_000);
  return null;
}

function StateChip({ c, globalDays }: { c: AdminClassified; globalDays: number }) {
  if (c.status !== 1) return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">معطّل</span>;
  const exp = effectiveExpiry(c, globalDays);
  if (exp && exp.getTime() < Date.now()) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">منتهٍ</span>;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">نشط</span>;
}

export default async function AdminClassified() {
  await requirePerm('classified');
  const [items, globalDays] = await Promise.all([getAllClassifieds(120), getClassifiedLifetimeDays().catch(() => 0)]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الإعلانات المبوّبة ({en(items.length)})</h1>
      </div>

      {/* المدة العامة الافتراضية + تلميح المدة الخاصة */}
      <div className="card-3d flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
        <Timer className="h-4 w-4 shrink-0 text-primary" />
        <span>مدة البقاء الافتراضية: <b className="text-primary">{globalDays > 0 ? `${en(globalDays)} يوم` : 'بلا حد'}</b></span>
        <Link href="/admin/settings" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"><Settings className="h-3.5 w-3.5" /> تغييرها</Link>
        <span className="text-xs text-muted-foreground">— وتحديد مدة لإعلان بعينه أدناه يتغلّب على الافتراضية.</span>
      </div>

      {items.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات مبوّبة.</p>}
      <div className="grid gap-2 lg:grid-cols-2">
        {items.map((c) => {
          const t = CLASSIFIED_THEMES[c.theme % CLASSIFIED_THEMES.length];
          const exp = effectiveExpiry(c, globalDays);
          const enabled = c.status === 1;
          return (
            <div key={c.id} className="card-3d space-y-2 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cover bg-center" style={c.image ? { backgroundImage: `url(${c.image})` } : { backgroundImage: `linear-gradient(150deg, ${t.from}, ${t.to})` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.title || c.text || '(بدون نص)'}</span>
                    <StateChip c={c} globalDays={globalDays} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>#{c.id}</span>
                    <span>{timeAgo(c.createdAt)}</span>
                    <span>👁 {en(c.views)}</span>
                    {exp
                      ? <span className={exp.getTime() < Date.now() ? 'font-bold text-red-600' : ''}>ينتهي {fmtDate(exp)}{!c.expiresAt && ' (افتراضي)'}</span>
                      : <span>بلا انتهاء</span>}
                    {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary"><ExternalLink className="h-3 w-3" /> رابط</a>}
                  </div>
                </div>
              </div>

              {/* تنشيط/تعطيل · مدة البقاء · حذف */}
              <div className="flex flex-wrap items-center gap-1.5">
                <form action={toggleClassifiedAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="action" value={enabled ? 'disable' : 'enable'} />
                  {enabled
                    ? <button className="flex items-center gap-1 rounded-md border border-amber-400 px-2.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50"><Pause className="h-3.5 w-3.5" /> تعطيل</button>
                    : <button className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white"><Play className="h-3.5 w-3.5" /> تنشيط</button>}
                </form>

                <form action={classifiedLifetimeAction} className="flex items-center gap-1 rounded-md border border-primary/30 p-0.5">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="days" type="number" min={0} max={3650} placeholder="أيام" title="مدة البقاء بالأيام من الآن (0 = حسب الافتراضية)" className="w-16 rounded bg-background px-1.5 py-1 text-xs" />
                  <button className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary"><Timer className="h-3.5 w-3.5" /> مدة</button>
                </form>

                <form action={adminDeleteClassifiedAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit msg="حذف هذا الإعلان المبوّب نهائياً؟ لا يمكن التراجع." className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> حذف</ConfirmSubmit>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

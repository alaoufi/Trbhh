import { Crown, Check, Megaphone, Clock, Star, Sparkles } from 'lucide-react';
import { getPackages } from '@/lib/packages';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الباقات والاشتراكات' };

function tierStyle(tier: string) {
  if (tier === 'gold') return { ring: 'ring-2 ring-amber-400', badge: 'bg-amber-400 text-amber-950', label: 'ذهبية', icon: 'fill-amber-400 text-amber-400' };
  if (tier === 'silver') return { ring: 'ring-2 ring-slate-300', badge: 'bg-slate-300 text-slate-800', label: 'فضية', icon: 'fill-slate-400 text-slate-400' };
  return { ring: 'ring-1 ring-primary/20', badge: 'bg-primary/10 text-primary', label: '', icon: 'text-primary' };
}

export default async function PackagesPage() {
  const packages = await getPackages(true);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Crown className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الباقات والاشتراكات</h1>
      </div>
      <p className="text-sm text-muted-foreground">اختر الباقة المناسبة لك — كلما ارتفعت الباقة زاد عدد إعلاناتك وظهورك المميّز بالأعلى.</p>

      {packages.length === 0 && <p className="py-10 text-center text-muted-foreground">لا توجد باقات متاحة حالياً.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => {
          const s = tierStyle(p.tier);
          return (
            <div key={p.id} className={`relative flex flex-col rounded-2xl bg-white p-5 shadow-sm ${s.ring}`}>
              {p.tier && (
                <span className={`absolute left-4 top-4 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.badge}`}>
                  <Star className={`h-3 w-3 ${s.icon}`} /> {s.label}
                </span>
              )}
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Crown className="h-6 w-6" /></span>
                <h2 className="text-lg font-bold text-primary">{p.name}</h2>
              </div>

              <div className="mb-4">
                {p.price === 0 ? (
                  <span className="text-2xl font-extrabold text-green-600">مجانية</span>
                ) : (
                  <span className="text-2xl font-extrabold text-primary">{new Intl.NumberFormat('ar-SA').format(p.price)} <span className="text-sm font-medium text-muted-foreground">﷼</span></span>
                )}
              </div>

              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 shrink-0 text-primary" />
                  {p.adsPerDay > 0 ? <span><b>{p.adsPerDay}</b> إعلان في اليوم</span> : <span>إعلانات <b>بلا حد يومي</b></span>}
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-primary" />
                  {p.gapHours > 0 ? <span>فارق <b>{p.gapHours}</b> ساعة بين كل إعلان</span> : <span>بدون فاصل زمني بين الإعلانات</span>}
                </li>
                {p.featuredSlots > 0 && (
                  <li className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>تثبيت <b>{p.featuredSlots}</b> إعلان بالأعلى{p.featuredDays > 0 ? <> لمدة <b>{p.featuredDays}</b> يوم</> : null}</span>
                  </li>
                )}
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-4 w-4 shrink-0 text-green-600" /> دعم ومزايا الموقع كاملة
                </li>
              </ul>
            </div>
          );
        })}
      </div>

      <p className="rounded-xl border border-primary/15 bg-card p-3 text-center text-xs text-muted-foreground">
        للاشتراك في باقة مدفوعة تواصل مع إدارة الموقع وسيتم تفعيلها على حسابك.
      </p>
    </div>
  );
}

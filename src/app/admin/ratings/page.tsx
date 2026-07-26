import { Star, MapPin, User } from 'lucide-react';
import { requireAnyAdmin } from '@/lib/roles';
import { getPlatformRating, getPlatformReviews } from '@/lib/platform-rating';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تقييمات المنصة' };

export default async function AdminRatingsPage() {
  await requireAnyAdmin();
  const [rating, reviews] = await Promise.all([getPlatformRating(), getPlatformReviews(300)]);
  const low = reviews.filter((r) => r.star < 3);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
        <h1 className="text-xl font-bold text-primary">تقييمات المنصة</h1>
      </div>

      <div className="card-3d flex flex-wrap items-center gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-extrabold text-primary">{rating.avg > 0 ? rating.avg.toFixed(1) : '—'}</span>
          <div className="flex">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={`h-4 w-4 ${i <= Math.round(rating.avg) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
            ))}
          </div>
        </div>
        <span className="text-sm text-muted-foreground">من {rating.count} تقييم</span>
        {low.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">{low.length} تقييم منخفض (أقل من النصف)</span>}
      </div>

      {reviews.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-muted-foreground">لا توجد تقييمات بعد.</div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r, i) => (
            <div key={i} className={`card-3d rounded-xl border-r-4 p-3 ${r.star < 3 ? 'border-red-400 bg-red-50/40' : 'border-emerald-300'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 font-bold"><User className="h-3.5 w-3.5 text-primary" /> {r.name}</span>
                  {r.username && <span className="text-[11px] text-muted-foreground" dir="ltr">@{r.username}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`h-3.5 w-3.5 ${s <= r.star ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-primary">{r.star}/5</span>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {r.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.city}</span>}
                {r.at && <span>{timeAgo(r.at)}</span>}
              </div>
              {r.note && <p className={`mt-2 rounded-lg p-2 text-sm ${r.star < 3 ? 'bg-red-100/60 text-red-900' : 'bg-secondary/40 text-foreground/80'}`}>«{r.note}»</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

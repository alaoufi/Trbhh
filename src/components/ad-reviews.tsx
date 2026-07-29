import { Star, ShieldCheck, ThumbsUp } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { AD_REVIEW_CRITERIA, type AdRating, type AdReview } from '@/lib/ad-reviews';
import { StarRatingInput } from '@/components/star-rating-input';
import { addAdReviewAction } from '@/app/ads/review-actions';

function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${value >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
      ))}
    </span>
  );
}

/**
 * تقييم الإعلان (تجارب العملاء) — بأسلوب المتاجر الكبرى: ملخّص عام + توزيع النجوم +
 * متوسط كل معيار + نسبة التوصية + نموذج تقييم متعدّد المعايير + قائمة التجارب.
 */
export function AdReviews({
  adId, rating, reviews, canReview, hasMine, notice,
}: {
  adId: number; rating: AdRating; reviews: AdReview[]; canReview: boolean; hasMine: boolean;
  notice?: string;
}) {
  const total = rating.count;
  return (
    <div id="reviews" className="card-3d space-y-4 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 font-bold text-primary"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /> تقييم الإعلان وتجارب العملاء ({total})</h2>

      {notice === 'rated' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-sm font-bold text-emerald-800">✓ شكراً، نُشرت تجربتك وستساعد بقية العملاء.</div>}
      {notice === 'star' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm font-bold text-amber-900">اختر «التقييم العام» بالنجوم أولاً.</div>}
      {notice === 'own' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm font-bold text-amber-900">لا يمكنك تقييم إعلانك.</div>}

      {total > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* الملخّص العام + التوزيع */}
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-3xl font-extrabold text-amber-500">{rating.avg}</div>
                <Stars value={Math.round(rating.avg)} />
                <div className="mt-0.5 text-[11px] text-muted-foreground">{total} تقييم</div>
              </div>
              <div className="flex-1 space-y-1">
                {([5, 4, 3, 2, 1] as const).map((s) => {
                  const c = rating.dist[s];
                  const pct = total ? Math.round((c / total) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-3 text-muted-foreground">{s}</span>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></span>
                      <span className="w-6 text-left text-muted-foreground">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {rating.recommendPct > 0 && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                <ThumbsUp className="h-3.5 w-3.5" /> {rating.recommendPct}% يوصون بالتعامل
              </div>
            )}
          </div>

          {/* متوسط كل معيار */}
          <div className="space-y-2 rounded-xl border border-primary/15 p-3">
            <div className="mb-1 text-xs font-bold text-primary">تفاصيل التقييم حسب المعيار</div>
            {rating.criteria.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate">{c.icon} {c.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(c.avg / 5) * 100}%` }} /></span>
                <span className="w-7 text-left font-bold text-primary">{c.avg || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-secondary/30 p-3 text-sm text-muted-foreground">لا توجد تقييمات بعد — كن أول من يشارك تجربته مع هذا الإعلان وصاحبه.</p>
      )}

      {/* نموذج التقييم */}
      {canReview && (
        <form action={addAdReviewAction} className="space-y-3 rounded-xl border-2 border-primary/20 bg-white p-3">
          <input type="hidden" name="adId" value={adId} />
          <div className="text-sm font-extrabold text-primary">{hasMine ? '✏ عدّل تقييمك' : 'شارك تجربتك مع هذا الإعلان'}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">التقييم العام <span className="text-red-600">*</span></span>
            <StarRatingInput name="star" big />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {AD_REVIEW_CRITERIA.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1.5">
                <span className="text-xs font-bold">{c.icon} {c.label}</span>
                <StarRatingInput name={c.col} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold">توصي بالتعامل؟</span>
            <label className="flex items-center gap-1"><input type="radio" name="recommend" value="1" className="accent-emerald-600" /> نعم</label>
            <label className="flex items-center gap-1"><input type="radio" name="recommend" value="0" className="accent-red-600" /> لا</label>
          </div>
          <label className="flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-sm font-bold text-emerald-800">
            <input type="checkbox" name="verified" value="1" className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>✅ أؤكّد أنني تعاملت مع البائع فعلاً — يظهر تقييمي بشارة «تعامل موثّق» ليكون أوثق للعملاء.</span>
          </label>
          <textarea name="comment" rows={3} maxLength={1000} className="w-full rounded-lg border-2 border-primary/25 bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="اكتب تجربتك: هل طابق الإعلان الواقع؟ كيف كان تعامل صاحبه وجودة المنتج؟ (اختياري)" />
          <button className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"><Star className="h-4 w-4" /> {hasMine ? 'حفظ التعديل' : 'نشر تقييمي'}</button>
        </form>
      )}

      {/* قائمة التجارب */}
      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-xs font-extrabold text-primary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" /> : (r.author.trim().charAt(0) || '؟')}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                      {r.author}
                      {r.verifiedDeal && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" /> تعامل موثّق</span>}
                    </span>
                    <Stars value={r.star} className="h-3.5 w-3.5" />
                  </span>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{r.createdAt ? timeAgo(r.createdAt) : ''}</span>
              </div>
              {r.text && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{r.text}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AD_REVIEW_CRITERIA.map((c) => {
                  const v = r.criteria[c.key];
                  return v ? <span key={c.key} className="inline-flex items-center gap-0.5 rounded-full bg-secondary/40 px-2 py-0.5 text-[10px] font-bold"><span>{c.icon}</span> {c.label.split(' ')[0]} <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />{v}</span> : null;
                })}
                {r.recommend === 1 && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ShieldCheck className="h-3 w-3" /> يوصي بالتعامل</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Star, LogIn } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { submitPlatformRatingAction } from '@/app/actions';
import { cn } from '@/lib/utils';

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-3d shrink-0 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
      {pending ? '...' : 'إرسال تقييمك'}
    </button>
  );
}

/** تقييم منصة تربح بالنجوم — للأعضاء المسجّلين فقط، مرة واحدة، مع ملاحظة (تُطلب خاصة عند التقييم المنخفض). */
export function PlatformRatingWidget({ avg, count, alreadyRated, isLoggedIn }: { avg: number; count: number; alreadyRated: boolean; isLoggedIn?: boolean }) {
  const [star, setStar] = useState(0);
  const [hover, setHover] = useState(0);
  const [sent, setSent] = useState(false);
  const showForm = isLoggedIn && !alreadyRated && !sent;
  const low = star > 0 && star < 3; // أقل من النصف — نشجّع كتابة الملاحظات

  return (
    <div className="card-3d rounded-2xl px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-extrabold text-primary">{avg > 0 ? avg.toFixed(1) : '—'}</span>
          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={cn('h-3.5 w-3.5', i <= Math.round(avg) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">تقييم منصة تربح{count > 0 ? ` — من ${count} تقييم` : ' — كن أول من يقيّم'}</span>
        </div>

        {!isLoggedIn ? (
          <Link href="/login" className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
            <LogIn className="h-3.5 w-3.5" /> سجّل الدخول للتقييم
          </Link>
        ) : !showForm ? (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">✓ شكراً على تقييمك</span>
        ) : (
          <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" aria-label={`${i} نجوم`} onMouseEnter={() => setHover(i)} onClick={() => setStar(i)}>
                <Star className={cn('h-6 w-6', i <= (hover || star) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* نموذج الملاحظة + الإرسال — يظهر بعد اختيار نجمة (للمسجّل فقط) */}
      {showForm && star > 0 && (
        <form
          action={submitPlatformRatingAction}
          onSubmit={(e) => { if (star < 1) { e.preventDefault(); return; } setSent(true); }}
          className="mt-2 space-y-2 border-t pt-2"
        >
          <input type="hidden" name="star" value={star} />
          <label className={cn('block text-xs font-bold', low ? 'text-amber-700' : 'text-muted-foreground')}>
            {low ? '🙏 ما ملاحظاتك حتى نحسّنها؟ رأيك يهمّنا لتعديل ما يلزم.' : 'رأيك في المنصة (اختياري)'}
          </label>
          <textarea
            name="note"
            rows={low ? 3 : 2}
            maxLength={500}
            required={low}
            placeholder={low ? 'اكتب ما لم يعجبك وما تقترح تحسينه…' : 'شاركنا رأيك (اختياري)…'}
            className={cn('w-full rounded-lg border bg-white p-2 text-sm outline-none focus:ring-2', low ? 'border-amber-300 focus:ring-amber-300' : 'border-primary/30 focus:ring-primary/30')}
          />
          <div className="flex justify-end"><Submit disabled={star < 1} /></div>
        </form>
      )}
    </div>
  );
}

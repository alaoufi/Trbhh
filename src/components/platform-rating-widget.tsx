'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { submitPlatformRatingAction } from '@/app/actions';
import { cn } from '@/lib/utils';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-3d shrink-0 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
      {pending ? '...' : 'إرسال تقييمك'}
    </button>
  );
}

/** تقييم منصة تربح بالنجوم — للزوّار والأعضاء، مرة واحدة لكل منهما. */
export function PlatformRatingWidget({ avg, count, alreadyRated }: { avg: number; count: number; alreadyRated: boolean }) {
  const [star, setStar] = useState(5);
  const [hover, setHover] = useState(0);
  const [sent, setSent] = useState(false);
  const showForm = !alreadyRated && !sent;

  return (
    <div className="card-3d flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-extrabold text-primary">{avg > 0 ? avg.toFixed(1) : '—'}</span>
          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={cn('h-4 w-4', i <= Math.round(avg) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">تقييم منصة تربح{count > 0 ? ` — من ${count} تقييم` : ' — كن أول من يقيّم'}</p>
      </div>

      {showForm ? (
        <form action={submitPlatformRatingAction} onSubmit={() => setSent(true)} className="flex items-center gap-2">
          <input type="hidden" name="star" value={star} />
          <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" aria-label={`${i} نجوم`} onMouseEnter={() => setHover(i)} onClick={() => setStar(i)}>
                <Star className={cn('h-6 w-6', i <= (hover || star) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
              </button>
            ))}
          </div>
          <Submit />
        </form>
      ) : (
        <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">✓ شكراً على تقييمك</span>
      )}
    </div>
  );
}

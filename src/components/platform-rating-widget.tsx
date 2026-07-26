'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Star, LogIn, Pencil } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { submitPlatformRatingAction } from '@/app/actions';
import { cn } from '@/lib/utils';

function Submit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-3d shrink-0 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
      {pending ? '...' : label}
    </button>
  );
}

/** تقييم منصة تربح بالنجوم — للأعضاء المسجّلين فقط، مع إمكانية تعديل التقييم لاحقاً وملاحظة (تُطلب خاصة عند التقييم المنخفض). */
export function PlatformRatingWidget({ avg, count, alreadyRated, isLoggedIn, myStar = 0, myNote = '' }: { avg: number; count: number; alreadyRated: boolean; isLoggedIn?: boolean; myStar?: number; myNote?: string }) {
  const [star, setStar] = useState(myStar || 0);
  const [hover, setHover] = useState(0);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  // النموذج يظهر: للمسجّل، ولم يُرسِل الآن، وإمّا لم يقيّم بعد أو اختار التعديل
  const showForm = isLoggedIn && !sent && (!alreadyRated || editing);
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
        ) : sent ? (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">✓ شكراً، حُفظ تقييمك</span>
        ) : alreadyRated && !editing ? (
          /* قيّم سابقاً: نعرض تقييمه مع زر تعديل */
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={cn('h-4 w-4', i <= myStar ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
              ))}
            </span>
            <button type="button" onClick={() => { setStar(myStar || 0); setEditing(true); }} className="flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/5">
              <Pencil className="h-3 w-3" /> تعديل تقييمي
            </button>
          </div>
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

      {/* نموذج الملاحظة + الإرسال — يظهر بعد اختيار نجمة (للمسجّل فقط)، ويُعبّأ بملاحظته عند التعديل */}
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
            defaultValue={editing ? myNote : ''}
            placeholder={low ? 'اكتب ما لم يعجبك وما تقترح تحسينه…' : 'شاركنا رأيك (اختياري)…'}
            className={cn('w-full rounded-lg border bg-white p-2 text-sm outline-none focus:ring-2', low ? 'border-amber-300 focus:ring-amber-300' : 'border-primary/30 focus:ring-primary/30')}
          />
          <div className="flex items-center justify-end gap-2">
            {editing && <button type="button" onClick={() => { setEditing(false); setStar(myStar || 0); }} className="rounded-lg border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary">إلغاء</button>}
            <Submit disabled={star < 1} label={editing ? 'حفظ التعديل' : 'إرسال تقييمك'} />
          </div>
        </form>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { submitReviewAction } from '@/app/users/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Submit() {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? '...' : 'إرسال التقييم'}</Button>;
}

export function ReviewForm({ reciverId }: { reciverId: number }) {
  const [star, setStar] = useState(5);
  const [hover, setHover] = useState(0);
  return (
    <form action={submitReviewAction} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <input type="hidden" name="reciverId" value={reciverId} />
      <input type="hidden" name="star" value={star} />
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setStar(i)}>
            <Star className={cn('h-6 w-6', i <= (hover || star) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
          </button>
        ))}
      </div>
      <textarea name="review" rows={3} placeholder="اكتب تقييمك لتعاملك مع هذا العضو..." className="w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <Submit />
    </form>
  );
}

'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';

/** إدخال نجوم تفاعلي (1..5) — يكتب القيمة في حقل مخفي باسم name لإرساله مع النموذج. */
export function StarRatingInput({ name, big = false, defaultValue = 0 }: { name: string; big?: boolean; defaultValue?: number }) {
  const [val, setVal] = useState(defaultValue);
  const [hover, setHover] = useState(0);
  const sz = big ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <div className="flex items-center gap-0.5" dir="ltr" onMouseLeave={() => setHover(0)}>
      <input type="hidden" name={name} value={val} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          onClick={() => setVal(n === val ? 0 : n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} من 5`}
          className="rounded p-0.5 transition hover:scale-110"
        >
          <Star className={`${sz} ${(hover || val) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
        </button>
      ))}
    </div>
  );
}

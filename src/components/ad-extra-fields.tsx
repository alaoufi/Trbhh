'use client';
import { useState } from 'react';
import { Tag } from 'lucide-react';

export function AdExtraFields({
  initial = {},
  hideNegotiable = false,
}: {
  initial?: {
    negotiable?: boolean;
    condition?: 'new' | 'used' | 'refurbished';
    delivery?: boolean;
    warranty?: string;
    quantity?: number;
  };
  /** إخفاء خانة «السعر قابل للتفاوض» — تُخفى في وضع «على السوم» لأنه تفاوض كامل بلا سعر */
  hideNegotiable?: boolean;
}) {
  const [negotiable, setNegotiable] = useState(initial.negotiable ?? false);

  return (
    <div className="space-y-4">
      {/* السعر قابل للتفاوض — يُخفى في وضع «على السوم» (تفاوض كامل بلا سعر، فلا معنى للخانة) */}
      {!hideNegotiable && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-primary/15 bg-primary/5 p-3">
          <Tag className="h-5 w-5 text-primary" />
          <label className="flex flex-1 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="negotiable"
              checked={negotiable}
              onChange={(e) => setNegotiable(e.target.checked)}
              className="accent-primary"
            />
            السعر قابل للتفاوض
          </label>
        </div>
      )}

      {/* الحالة والكمية والتوصيل والضمان أصبحت حقولاً متخصصة داخل قالب القسم الفرعي. */}
    </div>
  );
}

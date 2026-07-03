import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Arabic relative time (e.g. "قبل 3 ساعات"). */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const days = Math.floor(h / 24);
  if (days < 30) return `قبل ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `قبل ${months} شهر`;
  return `قبل ${Math.floor(months / 12)} سنة`;
}

/** Format a price with Arabic thousands separators. When there's no price:
 *  "على السوم" for an offer (open to bargaining), but "مطلوب" for a request
 *  (طلب) — a request must never read "على السوم". */
export function formatPrice(price: number | null | undefined, currency = 'ر.س', adsType?: string | null): string {
  if (!price || price <= 0) return adsType === 'request' ? 'مطلوب' : 'على السوم';
  return `${new Intl.NumberFormat('en-US').format(price)} ${currency}`;
}

export function toInt(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}

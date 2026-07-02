// Client-safe shared types + fixed banner placements for paid promo ads.

export type PromoPlacement = 'home_top' | 'feed' | 'ad_detail' | 'member';
export type PromoStatus = 'pending' | 'active' | 'rejected' | 'expired';

/** Fixed placements with known dimensions so the designer knows the exact size. */
export const PLACEMENTS: {
  key: PromoPlacement; label: string; desc: string; ratio: string; size: string;
}[] = [
  { key: 'home_top',  label: 'أعلى الصفحة الرئيسية',        desc: 'بانر عريض يظهر أعلى الصفحة الرئيسية',      ratio: '3 / 1', size: '1200×400' },
  { key: 'feed',      label: 'بين الإعلانات (كل ٤ إعلانات)', desc: 'شريط يظهر ضمن قائمة الإعلانات بعد كل ٤ إعلانات', ratio: '3 / 1', size: '1200×400' },
  { key: 'ad_detail', label: 'داخل تفاصيل الإعلان',          desc: 'بانر يظهر في صفحة تفاصيل أي إعلان',        ratio: '3 / 1', size: '1200×400' },
  { key: 'member',    label: 'صفحة العضو / المعلن',          desc: 'بانر يظهر في صفحة العضو',                  ratio: '3 / 1', size: '1200×400' },
];

export const PLACEMENT_LABEL: Record<PromoPlacement, string> =
  Object.fromEntries(PLACEMENTS.map((p) => [p.key, p.label])) as Record<PromoPlacement, string>;

export const PLACEMENT_RATIO: Record<PromoPlacement, string> =
  Object.fromEntries(PLACEMENTS.map((p) => [p.key, p.ratio])) as Record<PromoPlacement, string>;

export function isPlacement(v: string): v is PromoPlacement {
  return PLACEMENTS.some((p) => p.key === v);
}

export type PromoPackage = { id: number; name: string; days: number; price: number; active: boolean; sort: number };

export type Promo = {
  id: number;
  userId: number | null;
  placement: PromoPlacement;
  title: string | null;
  body: string | null;
  image: string | null;
  phone: string | null;
  whatsapp: string | null;
  link: string | null;
  price: number;
  days: number;
  startsAt: string | null;
  endsAt: string | null;
  status: PromoStatus;
  createdAt: string | null;
};

export const STATUS_LABEL: Record<PromoStatus, string> = {
  pending: 'بانتظار الموافقة', active: 'منشور', rejected: 'مرفوض', expired: 'منتهٍ',
};

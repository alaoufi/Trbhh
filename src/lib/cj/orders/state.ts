/**
 * آلة حالات طلب CJ داخل تربح — رموز حالة داخلية ثابتة (لا نعتمد على نصوص CJ مباشرة).
 * وحدة منطق نقية (بلا شبكة/قاعدة بيانات) قابلة للاختبار. الشراء الحقيقي يبقى معطّلاً؛
 * هذه بنية فقط. ربط حالات CJ الفعلية يبقى Adapter مرناً حتى تأكيد Lomi/CJ.
 */

/** حالات المسار الطبيعي بالترتيب. */
export const FLOW_STATUSES = [
  'awaiting_payment', // بانتظار الدفع
  'paid',             // تم الدفع
  'verifying',        // التحقق (سعر/مخزون/شحن server-side)
  'sent_to_cj',       // أُرسل إلى CJ
  'cj_accepted',      // قبله CJ للتنفيذ
  'preparing',        // التجهيز للشحن
  'shipped',          // تم الشحن
  'in_transit',       // في الطريق
  'out_for_delivery', // خرج للتسليم
  'delivered',        // تم التسليم
  'completed',        // مكتمل
] as const;

/** حالات استثنائية منفصلة عن المسار. */
export const EXCEPTION_STATUSES = [
  'stalled',          // متعثر
  'needs_action',     // يحتاج تدخل
  'cancelled',        // ملغي
  'return_requested', // طلب إرجاع
  'refunded',         // مسترد
  'reshipped',        // إعادة إرسال/استبدال
] as const;

export type FlowStatus = (typeof FLOW_STATUSES)[number];
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];
export type OrderStatus = FlowStatus | ExceptionStatus;

export const ALL_STATUSES: OrderStatus[] = [...FLOW_STATUSES, ...EXCEPTION_STATUSES];

/** تسميات عربية للعرض (قابلة لاحقاً للنقل إلى إعدادات لوحة الإدارة عند الحاجة). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'بانتظار الدفع',
  paid: 'تم الدفع',
  verifying: 'قيد التحقق',
  sent_to_cj: 'أُرسل إلى المورد',
  cj_accepted: 'قبله المورد للتنفيذ',
  preparing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  in_transit: 'في الطريق',
  out_for_delivery: 'خرج للتسليم',
  delivered: 'تم التسليم',
  completed: 'مكتمل',
  stalled: 'متعثر',
  needs_action: 'يحتاج تدخّلاً',
  cancelled: 'ملغى',
  return_requested: 'طلب إرجاع',
  refunded: 'مسترد',
  reshipped: 'إعادة إرسال/استبدال',
};

const FLOW_INDEX = new Map<string, number>(FLOW_STATUSES.map((s, i) => [s, i]));
const EXCEPTION_SET = new Set<string>(EXCEPTION_STATUSES);
/** حالات نهائية لا انتقال بعدها. */
export const TERMINAL_STATUSES = new Set<OrderStatus>(['completed', 'cancelled', 'refunded']);

export function isStatus(v: string): v is OrderStatus {
  return FLOW_INDEX.has(v) || EXCEPTION_SET.has(v);
}
export function isException(s: OrderStatus): boolean {
  return EXCEPTION_SET.has(s);
}
export function isTerminal(s: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}
export function statusLabel(s: string): string {
  return isStatus(s) ? ORDER_STATUS_LABELS[s] : s;
}

/**
 * هل الانتقال مسموح؟ القاعدة:
 * - داخل المسار: للأمام فقط (خطوة أو أكثر)، لا للخلف.
 * - من أي حالة غير نهائية يمكن الدخول لحالة استثنائية (تعثّر/إلغاء/إرجاع…).
 * - لا انتقال من حالة نهائية.
 * - بعض المسارات الاستثنائية تعود للمسار: needs_action/stalled → أي حالة مسار لاحقة،
 *   reshipped → preparing، return_requested → refunded/reshipped.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (!isStatus(to)) return false;

  // الدخول إلى حالة استثنائية متاح من أي حالة حيّة.
  if (isException(to)) {
    if (to === 'refunded') return from === 'return_requested' || from === 'cancelled' || from === 'needs_action';
    if (to === 'reshipped') return from === 'return_requested' || from === 'needs_action' || from === 'stalled';
    return true;
  }

  // to حالة مسار.
  const ti = FLOW_INDEX.get(to)!;
  if (FLOW_INDEX.has(from)) {
    const fi = FLOW_INDEX.get(from)!;
    return ti > fi; // للأمام فقط
  }
  // from استثنائية تعود للمسار (استئناف).
  if (from === 'needs_action' || from === 'stalled') return true;
  if (from === 'reshipped') return ti >= FLOW_INDEX.get('preparing')!;
  return false;
}

/** الحالات المسموح الانتقال إليها من حالة معيّنة (للواجهة والتحقق). */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return ALL_STATUSES.filter((to) => canTransition(from, to));
}

/**
 * ربط حالة CJ الخام إلى رمز داخلي (Adapter مرن). القيم أدناه مبدئية best-effort
 * حتى تأكيد Lomi/CJ للقيم الرسمية — تُوسَّع دون تغيير بقية النظام. تُطابَق بحروف صغيرة.
 * تُعيد null لِما هو غير معروف (فيُترك القرار للمراقبة اليدوية، لا افتراض).
 */
export const CJ_STATUS_MAP: Record<string, FlowStatus> = {
  // إنشاء/قبول
  created: 'sent_to_cj',
  unpaid: 'sent_to_cj',
  pending: 'sent_to_cj',
  paid: 'cj_accepted',
  processing: 'preparing',
  'in production': 'preparing',
  undelivered: 'preparing',
  // شحن/تتبع
  shipped: 'shipped',
  'partially shipped': 'shipped',
  'in transit': 'in_transit',
  intransit: 'in_transit',
  'out for delivery': 'out_for_delivery',
  delivered: 'delivered',
  completed: 'completed',
};

/** ربط حالة CJ الخام إلى الرمز الداخلي، أو null إن كانت غير معروفة. */
export function mapCjStatus(raw: string | null | undefined): FlowStatus | null {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return CJ_STATUS_MAP[key] ?? null;
}

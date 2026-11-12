import type { Prisma } from '@prisma/client';

type Plan = { id: number; adDays: number };
type Subscription = { userId: number; packageId: number };

/**
 * رؤية بطاقات العرض/البحث في تربح. قرار منتج ثابت: **العرض العام غير محدود بمدة
 * الباقة** — مدة الباقة (adDays) تخصّ حدّ نشر المعلن فقط، لا إخفاء الإعلان من قوائم
 * التصفّح والبحث. لذا لا يُفرض أي قيد عمر هنا؛ يُستثنى فقط المعلن المحظور فلا تظهر
 * إعلاناته. (تحديد العمر العام، إن أراده المشرف، عبر الأرشفة التلقائية المنفصلة
 * ad_lifetime_days التي تؤرشف فعلياً — لا عبر مدة الباقة.)
 * التوقيع يبقى كما هو للتوافق مع مواضع الاستدعاء؛ معاملات الخطط/الاشتراكات لم تعد
 * تؤثّر على الرؤية.
 */
export function searchCardVisibility(args: {
  plans: Plan[]; defaultDays: number; subscriptions: Subscription[]; bannedIds: bigint[]; now: Date;
}): Prisma.adsWhereInput {
  return args.bannedIds.length ? { user_id: { notIn: args.bannedIds } } : {};
}

import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;

export type NotifType = 'message' | 'comment' | 'review' | 'warning' | 'other';

/**
 * تنبيه موحّد للعضو: يُنشئ صفاً في جرس التنبيهات (صفحة /notifications) **و** يرسل
 * تنبيهاً فورياً (Web Push) لجهازه إن فعّلت الإدارة الدفع واشترك الجهاز — نقطة
 * واحدة لكل الأحداث (تعليق/تقييم/إنذار/متجر…) فلا يبقى نوع «ميت» بلا دفع.
 * الرسائل الخاصة لا تُنشئ صفاً هنا (تُحتسب من الرسائل غير المقروءة مباشرة) لكنها
 * تُدفع عبر sendChat — تفادياً لعدّها مرتين في الجرس.
 * لا يرمي أبداً؛ لا يعطّل العملية الأساسية.
 */
export async function notify(
  userId: number,
  opts: { title: string; route?: string; type?: NotifType; body?: string; dedupe?: boolean },
): Promise<void> {
  if (!userId) return;
  const title = opts.title.slice(0, 180);
  const route = opts.route || '/notifications';
  try {
    await ensure();
    let skip = false;
    if (opts.dedupe !== false) {
      // منع تكرار نفس العنوان لنفس العضو خلال ٢٤ ساعة (لا يُغرق الجرس)
      const dup = await prisma.notfications
        .findFirst({ where: { user_id: String(userId), title, created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } })
        .catch(() => null);
      skip = !!dup;
    }
    if (!skip) await prisma.notfications.create({ data: { title, route, user_id: String(userId), type: opts.type || 'other' } }).catch(() => {});
  } catch {
    /* لا يعطّل الحدث الأساسي */
  }
  // دفع فوري لكل أجهزة العضو — يُتجاهل بصمت عند تعطيل الدفع أو غياب اشتراك
  import('./push')
    .then(({ sendPushToUser }) => sendPushToUser(userId, { title, body: opts.body || '', url: route }))
    .catch(() => {});
}

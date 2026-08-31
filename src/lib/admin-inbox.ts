import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

/** The primary administration account that receives "message the admin" chats. */
let cachedAdminId: number | null = null;
export async function getPrimaryAdminId(): Promise<number> {
  if (cachedAdminId) return cachedAdminId;
  const admin = await prisma.users.findFirst({ where: { is_admin: 1 }, orderBy: { id: 'asc' }, select: { id: true } }).catch(() => null);
  cachedAdminId = admin ? toInt(admin.id) : 0;
  return cachedAdminId;
}

/** Unread messages sent to the administration (awaiting a reply/action). */
export async function countAdminUnread(): Promise<number> {
  const adminId = await getPrimaryAdminId();
  if (!adminId) return 0;
  const unread = await prisma.chats.findMany({ where: { reciver_id: adminId, is_read: 0 }, select: { sender_id: true } }).catch(() => []);
  if (!unread.length) return 0;
  const memberIds = [...new Set(unread.map((m) => m.sender_id).filter((id) => id !== adminId))];
  if (!memberIds.length) return 0;
  const archived = await prisma.admin_message_threads.findMany({
    where: { admin_id: adminId, member_id: { in: memberIds }, status: 'archived' },
    select: { member_id: true },
  }).catch(() => []);
  const archivedIds = new Set(archived.map((t) => t.member_id));
  return memberIds.filter((id) => !archivedIds.has(id)).length;
}

/** Normalize Arabic for keyword intent matching. */
function norm(s: string): string {
  return (s || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

/**
 * Smart, rule-based auto-reply from the administration. Reads the member's
 * message and picks the most fitting acknowledgement — always signed "الإدارة".
 * (No external AI needed; runs fully on the server.)
 */
export function smartAdminReply(message: string): string {
  const t = norm(message);
  const has = (...ws: string[]) => ws.some((w) => t.includes(norm(w)));
  let body: string;
  if (has('شكوى', 'نصب', 'احتيال', 'محتال', 'بلاغ', 'مزعج', 'اساءه', 'تهديد')) {
    body = 'استلمنا بلاغك/شكواك وهي محل اهتمامنا، وسيقوم الفريق المختص بمراجعتها واتخاذ اللازم. نقدّر حرصك على سلامة المجتمع.';
  } else if (has('كلمه المرور', 'نسيت', 'ما اقدر ادخل', 'لا استطيع الدخول', 'حسابي', 'محظور', 'ايقاف', 'تعطيل')) {
    body = 'بخصوص مشكلة الدخول/الحساب: رسالتك محل اهتمامنا وسنساعدك في حلّها. يمكنك أيضاً تجربة «نسيت كلمة المرور» من صفحة الدخول، وسنعاود التواصل معك.';
  } else if (has('اعلان', 'اعلاني', 'نشر', 'رفض', 'موافقه', 'حذف اعلان', 'تعديل اعلان')) {
    body = 'بخصوص إعلانك: رسالتك محل اهتمامنا وسنراجع الحالة ونوافيك بالتفاصيل قريباً. تأكّد من مطابقة الإعلان لشروط النشر لتسريع الاعتماد.';
  } else if (has('اشتراك', 'باقه', 'دفع', 'فاتوره', 'ترقيه', 'سعر', 'مبلغ')) {
    body = 'بخصوص الاشتراك/الباقة: رسالتك محل اهتمامنا وسيتواصل معك فريق الدعم لإتمام ما تحتاجه.';
  } else if (has('اقتراح', 'فكره', 'تطوير', 'ملاحظه', 'تحسين')) {
    body = 'شكراً لاقتراحك القيّم! ملاحظتك محل اهتمامنا وسنأخذها بعين الاعتبار ضمن خطط التطوير.';
  } else if (has('شكرا', 'مشكور', 'يعطيكم العافيه', 'ممتاز', 'رائع')) {
    body = 'نشكر لك لطفك وتواصلك معنا 🌟 سعداء بخدمتك دائماً.';
  } else {
    body = 'رسالتك محل اهتمامنا، وقد وصلت إلى إدارة تربّح. سيتم الاطّلاع عليها والرد في أقرب وقت ممكن. شكراً لتواصلك.';
  }
  return `${body}\n\n— الإدارة`;
}

/**
 * After a member messages the administration, decide whether to send the
 * automatic acknowledgement. Only fires when the admin hasn't replied to this
 * member in the last 2 hours, so rapid follow-up messages don't get spammed.
 */
export async function shouldAutoReply(adminId: number, memberId: number): Promise<boolean> {
  const last = await prisma.chats.findFirst({
    where: { sender_id: adminId, reciver_id: memberId },
    orderBy: { id: 'desc' },
    select: { created_at: true },
  }).catch(() => null);
  if (!last) return true;
  if (!last.created_at) return true;
  return Date.now() - last.created_at.getTime() > 2 * 3600_000;
}

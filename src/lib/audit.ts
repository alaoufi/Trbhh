import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/** تسجيل إجراء إداري في سجل النشاط — لا يعطّل الإجراء نفسه أبداً. */
export async function logAdmin(adminId: number, action: string, target = '', note = ''): Promise<void> {
  try {
    await ensure();
    await prisma.admin_log.create({
      data: { admin_id: BigInt(adminId), action: action.slice(0, 60), target: target ? target.slice(0, 160) : null, note: note ? note.slice(0, 300) : null },
    });
  } catch { /* audit must never break the action */ }
}

export type AdminLogRow = { id: number; adminId: number; adminName: string; action: string; target: string | null; note: string | null; at: string | null };

/** أفعال/ملاحظات ذات طابع مالي: مبالغ، رصيد، شحن، تسوية، استرداد، مصروف، عمولة،
 *  مدفوعات وبوابات الدفع. تفاصيلها (المبلغ في الملاحظة) تُحجب عمّن لا يملك صلاحية مالية. */
const FINANCIAL_AUDIT_RE = /(ر\.?\s?س|ريال|\bSAR\b|IBAN|آيبان|رصيد|تسوية|استرداد|مصروف|عمول|مكافأ|شحن رصيد|حساب شحن|توثيق مدفوع|تأكيد شحن|إلغاء تأكيد شحن|رفض شحن|الراجحي|دفع إلكتروني|مزوّد دفع|مفاتيح مزوّد|إعدادات الدفع|مدفوع)/;
/** هل السطر يكشف تفاصيل مالية؟ (يُفحص الفعل والملاحظة والهدف معاً). */
export function isFinancialAudit(action: string, note?: string | null, target?: string | null): boolean {
  return FINANCIAL_AUDIT_RE.test(`${action || ''} ${note || ''} ${target || ''}`);
}
export const REDACTED_FINANCIAL_NOTE = '🔒 تفاصيل مالية محجوبة (تتطلب صلاحية مالية)';
/** يحجب الملاحظة المالية (حيث المبالغ) للسطور المالية، مع إبقاء الفعل والهدف للمساءلة. */
function redactFinancialRow(r: AdminLogRow): AdminLogRow {
  return isFinancialAudit(r.action, r.note, r.target) ? { ...r, note: REDACTED_FINANCIAL_NOTE } : r;
}
/** يطبّق حجب الملاحظات المالية على مجموعة سطور — نقيّ وقابل للاختبار بلا قاعدة بيانات. */
export function redactAdminLogRows(rows: AdminLogRow[], redact: boolean): AdminLogRow[] {
  return redact ? rows.map(redactFinancialRow) : rows;
}

/** سجل ما أرسلته الإدارة للمتاجر (إنذارات ورسائل رسمية وإخفاء إعلانات) مع اسم المُرسِل.
 *  مبني من سجل النشاط الإداري، مجمّعاً حسب المتجر. */
export type StoreComm = { id: number; kind: 'warn' | 'message' | 'adhide' | 'suspend' | 'suspend_perm' | 'reactivate' | 'approve' | 'reject'; adminName: string; text: string | null; at: string | null };
const STORE_COMM_ACTIONS: Record<string, StoreComm['kind']> = {
  'إنذار متجر': 'warn',
  'رسالة رسمية لتاجر': 'message',
  'إخفاء إعلان متجر عن النشر + إنذار مخالفة': 'adhide',
  'إيقاف مؤقت لمتجر': 'suspend',
  'إيقاف نهائي لمتجر': 'suspend_perm',
  'إعادة تفعيل متجر': 'reactivate',
  'اعتماد متجر': 'approve',
  'رفض متجر': 'reject',
};
export async function getStoresCommsLog(limit = 500): Promise<Map<number, StoreComm[]>> {
  await ensure();
  const rows = await prisma.admin_log.findMany({
    where: { action: { in: Object.keys(STORE_COMM_ACTIONS) } },
    orderBy: { id: 'desc' }, take: Math.min(1000, limit),
  }).catch(() => []);
  const ids = [...new Set(rows.map((r) => toInt(r.admin_id)))];
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const map = new Map<number, StoreComm[]>();
  for (const r of rows) {
    const m = (r.target || '').match(/متجر #(\d+)/);
    if (!m) continue;
    const sid = Number(m[1]);
    const arr = map.get(sid) || [];
    if (arr.length < 40) {
      arr.push({
        id: toInt(r.id), kind: STORE_COMM_ACTIONS[r.action] || 'message',
        adminName: nameById.get(toInt(r.admin_id)) || `#${toInt(r.admin_id)}`,
        text: r.note, at: r.created_at ? r.created_at.toISOString() : null,
      });
      map.set(sid, arr);
    }
  }
  return map;
}

/** إجمالي أسطر سجل النشاط. */
export async function countAdminLog(): Promise<number> {
  await ensure();
  return prisma.admin_log.count().catch(() => 0);
}

/** كل ما نفّذته الإدارة تجاه عضو معيّن (حظر/رفع حظر/توثيق/قرارات طلباته...) —
 *  سجل تاريخي كامل لصفحة العضو. يطابق «العضو #<id>» في حقل target مع حدّ فاصل
 *  يمنع تطابق #12 خطأً مع #123. */
export async function getUserAdminLog(userId: number, limit = 200, opts: { redactFinancial?: boolean } = {}): Promise<AdminLogRow[]> {
  await ensure();
  const rows = await prisma.admin_log.findMany({
    where: { target: { contains: `العضو #${userId}` } },
    orderBy: { id: 'desc' },
    take: Math.min(500, limit) * 2, // هامش قبل الفلترة الدقيقة بحدّ الرقم
  }).catch(() => []);
  const re = new RegExp(`العضو #${userId}(?!\\d)`);
  const filtered = rows.filter((r) => re.test(r.target || '')).slice(0, Math.min(500, limit));
  const ids = [...new Set(filtered.map((r) => toInt(r.admin_id)))];
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const mapped = filtered.map((r) => ({
    id: toInt(r.id), adminId: toInt(r.admin_id), adminName: nameById.get(toInt(r.admin_id)) || `#${toInt(r.admin_id)}`,
    action: r.action, target: r.target, note: r.note, at: r.created_at ? r.created_at.toISOString() : null,
  }));
  return redactAdminLogRows(mapped, !!opts.redactFinancial);
}

/** قراءة سجل النشاط (الأحدث أولاً) مع أسماء المشرفين. */
export async function listAdminLog(limit = 200, offset = 0, opts: { redactFinancial?: boolean } = {}): Promise<AdminLogRow[]> {
  await ensure();
  const rows = await prisma.admin_log.findMany({ orderBy: { id: 'desc' }, skip: Math.max(0, offset), take: Math.min(500, limit) }).catch(() => []);
  const ids = [...new Set(rows.map((r) => toInt(r.admin_id)))];
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const mapped = rows.map((r) => ({
    id: toInt(r.id), adminId: toInt(r.admin_id), adminName: nameById.get(toInt(r.admin_id)) || `#${toInt(r.admin_id)}`,
    action: r.action, target: r.target, note: r.note, at: r.created_at ? r.created_at.toISOString() : null,
  }));
  return redactAdminLogRows(mapped, !!opts.redactFinancial);
}

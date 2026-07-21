import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/** تسجيل خطأ اعترض عضواً (شاشة «حدث خطأ غير متوقع») — لا يعطّل تجربته أبداً حتى لو فشل التسجيل نفسه. */
export async function logClientError(data: { message: string; digest?: string; stack?: string; url?: string; userId?: number; userAgent?: string }): Promise<void> {
  try {
    await ensure();
    await prisma.error_log.create({
      data: {
        message: (data.message || 'خطأ غير معروف').slice(0, 500),
        digest: data.digest ? data.digest.slice(0, 64) : null,
        stack: data.stack ? data.stack.slice(0, 8000) : null,
        url: data.url ? data.url.slice(0, 300) : null,
        user_id: data.userId ? BigInt(data.userId) : null,
        user_agent: data.userAgent ? data.userAgent.slice(0, 300) : null,
      },
    });
  } catch { /* التسجيل نفسه لا يجب أن يكسر شيئاً */ }
}

export type ErrorLogRow = {
  id: number; message: string; digest: string | null; stack: string | null; url: string | null;
  userId: number | null; userName: string; userAgent: string | null; at: string | null;
};

/** أحدث الأخطاء المسجَّلة — لصفحة الإدارة. */
export async function listErrorLogs(limit = 50, offset = 0): Promise<{ rows: ErrorLogRow[]; total: number }> {
  await ensure();
  const [total, rows] = await Promise.all([
    prisma.error_log.count().catch(() => 0),
    prisma.error_log.findMany({ orderBy: { id: 'desc' }, take: limit, skip: Math.max(0, offset) }).catch(() => []),
  ]);
  const uids = [...new Set(rows.filter((r) => r.user_id).map((r) => toInt(r.user_id!)))];
  const users = uids.length
    ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }).catch(() => [])
    : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  return {
    total,
    rows: rows.map((r) => ({
      id: toInt(r.id), message: r.message, digest: r.digest, stack: r.stack, url: r.url,
      userId: r.user_id ? toInt(r.user_id) : null,
      userName: r.user_id ? nameById.get(toInt(r.user_id)) || `#${toInt(r.user_id)}` : 'زائر',
      userAgent: r.user_agent,
      at: r.created_at ? r.created_at.toISOString() : null,
    })),
  };
}

/** حذف كل السجلات القديمة — تنظيف الأرشيف يدوياً. */
export async function clearErrorLogs(): Promise<void> {
  await ensure();
  await prisma.error_log.deleteMany({}).catch(() => {});
}

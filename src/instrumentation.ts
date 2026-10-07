/**
 * Runs once when the Next.js server boots (before serving traffic).
 * Guarantees the self-provisioned schema exists before any query — so typed
 * Prisma models can rely on columns like stores.status or users.ban_until
 * even on a freshly restored database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureSchema } = await import('@/data/schema-sync');
    await ensureSchema().catch((e) => console.error('[schema-sync] failed at boot:', e));
  }
}

/**
 * يلتقط أخطاء التصيير الخادمية الحقيقية (React #441 يخفي الرسالة في الإنتاج) ويسجّلها
 * في سجل الأخطاء بالإدارة (/admin/errors) برسالتها وstack الحقيقيين + المسار + digest،
 * فيُكشَف السبب الجذري دون الحاجة لقراءة سجلّ الحاوية يدوياً. لا يكسر الطلب أبداً.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context?: { routePath?: string; routerKind?: string; routeType?: string },
) {
  try {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const err = error as (Error & { digest?: string }) | undefined;
    const where = context?.routePath ? ` @ ${context.routePath}` : '';
    const { logClientError } = await import('@/lib/error-log');
    await logClientError({
      message: `[server${context?.routeType ? ':' + context.routeType : ''}] ${err?.message || 'server render error'}${where}`,
      digest: err?.digest,
      stack: err?.stack,
      url: request?.path,
    });
  } catch { /* التسجيل لا يجب أن يكسر الخادم أبداً */ }
}

'use server';
import { getSession } from '@/lib/auth';
import { logClientError } from '@/lib/error-log';

/** يُستدعى من حدود الأخطاء (error.tsx / global-error.tsx) — يسجّل الخطأ فوراً دون أي أثر على تجربة العضو. */
export async function reportClientErrorAction(input: { message: string; digest?: string; stack?: string; url?: string }) {
  const session = await getSession().catch(() => null);
  const { headers } = await import('next/headers');
  const userAgent = (await headers()).get('user-agent') || undefined;
  await logClientError({
    message: input.message,
    digest: input.digest,
    stack: input.stack,
    url: input.url,
    userId: session?.uid,
    userAgent,
  });
}

import type { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { isCloudBackupKey } from '@/lib/cloud-backup';
import { r2BackupConfig, r2Open } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** تنزيل نسخة احتياطية مشفّرة من مخزن R2 — لمن له صلاحية تصدير النسخ فقط. الملف يبقى مشفّراً. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !(await hasAccess(session.uid, 'backup', 'export'))) return new Response('غير مصرّح', { status: 403 });
  const key = req.nextUrl.searchParams.get('key') || '';
  const cfg = r2BackupConfig();
  if (!cfg || !isCloudBackupKey(key)) return new Response('اسم غير صالح', { status: 400 });
  const obj = await r2Open(key, null, cfg).catch(() => null);
  if (!obj || obj.status !== 200) { obj?.body.destroy(); return new Response('غير موجود', { status: 404 }); }
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  };
  if (obj.headers['content-length']) headers['Content-Length'] = String(obj.headers['content-length']);
  return new Response(Readable.toWeb(obj.body) as unknown as ReadableStream, { headers });
}

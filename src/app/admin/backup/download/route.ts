import type { NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { getSession } from '@/lib/auth';
import { hasAction } from '@/lib/roles';
import { backupFilePath, isValidBackupName } from '@/lib/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !(await hasAction(session.uid, 'backup', 'view'))) {
    return new Response('غير مصرّح', { status: 403 });
  }
  const name = req.nextUrl.searchParams.get('name') || '';
  if (!isValidBackupName(name)) return new Response('اسم غير صالح', { status: 400 });

  let file: string;
  try {
    file = backupFilePath(name);
  } catch {
    return new Response('مسار غير صالح', { status: 400 });
  }
  const s = await stat(file).catch(() => null);
  if (!s) return new Response('غير موجود', { status: 404 });

  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Length': String(s.size),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

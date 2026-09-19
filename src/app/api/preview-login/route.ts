import { createSession } from '@/lib/auth';
import { verifyLogin } from '@/lib/login-core';
import { assertSandboxDatabase, isPreviewSandbox, sandboxSameOrigin } from '@/lib/preview-sandbox';
import { readBoundedPreviewJson } from '@/lib/preview-request';
export const dynamic = 'force-dynamic';
const response = (value: unknown, status=200) => Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request: Request) {
  if (!isPreviewSandbox()) return response({error:'Unavailable'},404);
  assertSandboxDatabase(process.env.DATABASE_URL || '');
  if (!sandboxSameOrigin(request) || request.headers.has('next-action')) return response({error:'Invalid origin or action'},403);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return response({error:'JSON required'},415);
  let value: unknown;
  try { value=await readBoundedPreviewJson(request,8192); } catch { return response({error:'طلب غير صالح'},400); }
  const body=value as Record<string,unknown> | null;
  if (!body || typeof body.identifier !== 'string' || typeof body.password !== 'string'
    || !['preview','preview-store'].includes(body.identifier) || body.password.length > 256) return response({error:'استخدم حساب الاختبار المخصص'},400);
  const result=await verifyLogin(body.identifier,body.password,'');
  if (!result.ok) return response({error:result.error},401);
  await createSession({uid:result.uid,name:result.name,type:result.type,mfaVersion:result.mfaVersion,authVersion:result.authVersion});
  return response({ok:true});
}

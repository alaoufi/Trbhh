import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readBoundedPreviewJson } from '@/lib/preview-request';
import { assertSandboxDatabase, isPreviewSandbox, parseSandboxWrite, sandboxSameOrigin, SANDBOX_BODY_LIMIT, SANDBOX_KEYS } from '@/lib/preview-sandbox';

export const dynamic = 'force-dynamic';
function json(value: unknown, status = 200) {
  return Response.json(value, {status, headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
}
function available() {
  if (!isPreviewSandbox()) return false;
  assertSandboxDatabase(process.env.DATABASE_URL || '');
  return true;
}
export async function GET() {
  if (!available()) return json({error:'Unavailable'},404);
  const session = await getSession();
  if (!session) return json({error:'Login required'},401);
  const rows = await prisma.preview_states.findMany({where:{owner_id:session.uid,key:{in:[...SANDBOX_KEYS]}},select:{key:true,value:true,revision:true}});
  return json({ownerId:session.uid,values:Object.fromEntries(rows.map(r=>[r.key,JSON.parse(r.value)])),revisions:Object.fromEntries(rows.map(r=>[r.key,r.revision]))});
}

export async function PUT(request: Request) {
  if (!available()) return json({error:'Unavailable'},404);
  const session = await getSession();
  if (!session) return json({error:'Login required'},401);
  if (!sandboxSameOrigin(request)) return json({error:'Invalid origin'},403);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({error:'JSON required'},415);
  let body: ReturnType<typeof parseSandboxWrite>;
  try { body = parseSandboxWrite(await readBoundedPreviewJson(request, SANDBOX_BODY_LIMIT)); }
  catch (error) { return json({error:'Invalid sandbox state'},error instanceof RangeError ? 413 : 400); }
  const {key,value,revision} = body;
  // Revisions are per owner: a matching revision must never authorize a save
  // from a form hydrated before another tab changed the session account.
  if (body.ownerId !== session.uid) return json({error:'Account changed; reload before saving'},403);
  try {
    if (revision === 0) {
      await prisma.preview_states.create({data:{owner_id:session.uid,key,value:JSON.stringify(value),revision:1}});
    } else {
      const result = await prisma.preview_states.updateMany({where:{owner_id:session.uid,key,revision},data:{value:JSON.stringify(value),revision:{increment:1}}});
      if (result.count !== 1) return json({error:'State changed; reload before saving'},409);
    }
    return json({revision:revision+1});
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return json({error:'State changed; reload before saving'},409);
    // Do not expose connection details or content in logs/responses.
    return json({error:'Sandbox save failed'},503);
  }
}

import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {getSession} from '@/lib/auth';
import {hasAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {completeOAuth} from '@/lib/suppliers/connections';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  const session=await getSession();
  if(!session||!await hasAction(session.uid,'suppliers','edit'))return NextResponse.json({error:'unauthorized'},{status:403,headers:{'Cache-Control':'no-store'}});
  let origin:string;
  try {origin=supplierConfig().origin;} catch {return NextResponse.json({error:'supplier_configuration_required'},{status:503});}
  const jar=await cookies(),browser=jar.get('salla_oauth_browser')?.value||'';
  let outcome='connection_failed';
  try {
    if(request.nextUrl.searchParams.has('error'))throw new Error('denied');
    await completeOAuth(prisma,{state:request.nextUrl.searchParams.get('state')||'',code:request.nextUrl.searchParams.get('code')||'',browser,adminId:BigInt(session.uid)},supplierConfig());
    outcome='connected';
  } catch { /* OAuth responses can contain secrets; never log or reflect them. */ }
  const response=NextResponse.redirect(`${origin}/admin/suppliers/integrations?result=${outcome}`,303);
  response.cookies.set('salla_oauth_browser','',{maxAge:0,path:'/api/integrations/salla/callback',httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:')});
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');
  return response;
}

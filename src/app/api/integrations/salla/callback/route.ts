import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {getSession} from '@/lib/auth';
import {hasAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {completeOAuth} from '@/lib/suppliers/connections';
import {parseMerchantContext} from '@/lib/suppliers/merchant-oauth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  const session=await getSession();
  const jar=await cookies(),merchantContext=jar.get('salla_merchant_context')?.value||'';
  let adminId:bigint;
  if(merchantContext){
    try{
      const context=parseMerchantContext(merchantContext,request.nextUrl.searchParams.get('state')||'',supplierConfig());
      if(!await hasAction(Number(context.adminId),'suppliers','edit'))throw Error('permission_revoked');
      adminId=BigInt(context.adminId);
    }catch{return NextResponse.json({error:'invalid_merchant_authorization'},{status:403,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
  }else{
    if(!session||!await hasAction(session.uid,'suppliers','edit'))return NextResponse.json({error:'unauthorized'},{status:403,headers:{'Cache-Control':'no-store'}});
    adminId=BigInt(session.uid);
  }
  let origin:string;
  try {origin=supplierConfig().origin;} catch {return NextResponse.json({error:'supplier_configuration_required'},{status:503});}
  const browser=jar.get('salla_oauth_browser')?.value||'';
  let outcome='connection_failed';
  try {
    if(request.nextUrl.searchParams.has('error'))throw new Error('denied');
    await completeOAuth(prisma,{state:request.nextUrl.searchParams.get('state')||'',code:request.nextUrl.searchParams.get('code')||'',scope:request.nextUrl.searchParams.get('scope')||'',browser,adminId,...(merchantContext?{merchantContext}:{})},supplierConfig());
    outcome='connected';
  } catch { /* OAuth responses can contain secrets; never log or reflect them. */ }
  const response=merchantContext
    ? new NextResponse(outcome==='connected'?'تم ربط متجرك بتربح بنجاح. لم يتم تفعيل الشراء أو الدفع ولم تُنشر المنتجات للعامة.':'لم يكتمل ربط المتجر. تأكد من تفويض المتجر المقصود وتواصل مع إدارة تربح للحصول على رابط جديد.',{status:outcome==='connected'?200:400,headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}})
    : NextResponse.redirect(`${origin}/admin/suppliers/integrations?result=${outcome}`,303);
  response.cookies.set('salla_oauth_browser','',{maxAge:0,path:'/api/integrations/salla/callback',httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:')});
  if(merchantContext)response.cookies.set('salla_merchant_context','',{maxAge:0,path:'/api/integrations/salla/callback',httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:')});
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');
  return response;
}

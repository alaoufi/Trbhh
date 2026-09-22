import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {getSession} from '@/lib/auth';
import {hasAccess} from '@/lib/access-control/guards';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {completeOAuth,recordOAuthFailure} from '@/lib/suppliers/connections';
import {parseMerchantContext} from '@/lib/suppliers/merchant-oauth';
import {syncAuthorizedSupplier} from '@/lib/suppliers/sync';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function resultPage(success:boolean,syncPending=false){
 const title=success?'تم ربط متجرك':'لم يكتمل التفويض';
 const message=success
  ? syncPending?'تم ربط متجرك بتربح بنجاح. ستعيد تربح محاولة المزامنة تلقائيًا. لم يتم تفعيل الشراء أو الدفع ولم تُنشر المنتجات للعامة.':'تم ربط متجرك بتربح بنجاح وبدأت مزامنة الكتالوج. لم يتم تفعيل الشراء أو الدفع ولم تُنشر المنتجات للعامة.'
  :'لم يكتمل ربط المتجر. يمكنك فتح رابط التفويض نفسه والمحاولة مجددًا ما دام صالحًا، أو طلب رابط جديد من إدارة تربح.';
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f8fafc;color:#16294a;font-family:Tahoma,Arial,sans-serif}.box{max-width:560px;margin:12vh auto;padding:32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 16px 40px #16294a12}h1{margin-top:0}p{line-height:1.9}.mark{color:${success?'#15803d':'#b91c1c'};font-weight:700}</style></head><body><main class="box"><p class="mark">${success?'اكتمل التفويض':'تعذّر إكمال الخطوة'}</p><h1>${title}</h1><p>${message}</p><p>يمكنك إغلاق هذه الصفحة والعودة إلى تربح.</p></main></body></html>`;
}
export async function GET(request:NextRequest) {
  const session=await getSession();
  const jar=await cookies(),merchantContext=jar.get('salla_merchant_context')?.value||'';
  let adminId:bigint,merchantSupplierId:bigint|undefined;
  if(merchantContext){
    try{
      const context=parseMerchantContext(merchantContext,request.nextUrl.searchParams.get('state')||'',supplierConfig());
      if(!await hasAccess(Number(context.adminId),'integrations', 'authorize'))throw Error('permission_revoked');
      adminId=BigInt(context.adminId);merchantSupplierId=BigInt(context.supplierId);
    }catch{return NextResponse.json({error:'invalid_merchant_authorization'},{status:403,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
  }else{
    if(!session||!await hasAccess(session.uid,'integrations', 'authorize'))return NextResponse.json({error:'unauthorized'},{status:403,headers:{'Cache-Control':'no-store'}});
    adminId=BigInt(session.uid);
  }
  let origin:string;
  try {origin=supplierConfig().origin;} catch {return NextResponse.json({error:'supplier_configuration_required'},{status:503});}
  const browser=jar.get('salla_oauth_browser')?.value||'';
  let outcome='connection_failed',syncPending=false;
  try {
    if(request.nextUrl.searchParams.has('error'))throw new Error('supplier_oauth_denied');
    const supplierId=await completeOAuth(prisma,{state:request.nextUrl.searchParams.get('state')||'',code:request.nextUrl.searchParams.get('code')||'',scope:request.nextUrl.searchParams.get('scope')||'',browser,adminId,...(merchantContext?{merchantContext}:{})},supplierConfig());
    try{await syncAuthorizedSupplier(prisma,supplierId,supplierConfig());}catch{syncPending=true;}
    outcome='connected';
  } catch(error) {
    await recordOAuthFailure(prisma,{state:request.nextUrl.searchParams.get('state')||'',adminId,...(merchantSupplierId?{supplierId:merchantSupplierId}:{}),error}).catch(()=>undefined);
  }
  const response=merchantContext
    ? new NextResponse(resultPage(outcome==='connected',syncPending),{status:outcome==='connected'?200:400,headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'}})
    : NextResponse.redirect(`${origin}/admin/suppliers/integrations?result=${outcome==='connected'&&syncPending?'connected_sync_pending':outcome}`,303);
  response.cookies.set('salla_oauth_browser','',{maxAge:0,path:'/api/integrations/salla/callback',httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:')});
  if(merchantContext)response.cookies.set('salla_merchant_context','',{maxAge:0,path:'/api/integrations/salla/callback',httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:')});
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');
  return response;
}

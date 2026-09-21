import {NextRequest,NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {supplierDataFormValues,supplierDataOrigin} from '@/lib/suppliers/data-form';
import {saveSupplierDataInvitation} from '@/lib/suppliers/data-invitations';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
function redirect(origin:string,token:string,result:string){return NextResponse.redirect(`${origin}/supplier/data/${token}?${result}`,{status:303,headers});}
export async function POST(request:NextRequest){
 let origin:string;
 try{origin=supplierDataOrigin();}catch{return NextResponse.json({error:'unavailable'},{status:503,headers});}
 if(request.headers.get('origin')!==origin)return NextResponse.json({error:'invalid_origin'},{status:403,headers});
 let token='';
 try{
  const form=await request.formData();token=String(form.get('token')||'');if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error();
  const intent=String(form.get('intent')||'');if(!['draft','submit'].includes(intent))throw Error();
  await saveSupplierDataInvitation(prisma,token,supplierDataFormValues(form),intent==='submit',process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'');
  return redirect(origin,token,intent==='submit'?'submitted=1':'saved=1');
 }catch(error){
  if(/^[A-Za-z0-9_-]{43}$/.test(token)&&error instanceof Error&&error.message==='supplier_data_validation')return redirect(origin,token,'error=validation');
  if(/^[A-Za-z0-9_-]{43}$/.test(token))return redirect(origin,token,'error=invalid');
  return NextResponse.json({error:'invalid_request'},{status:400,headers});
 }
}

import {NextRequest,NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {hasAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {supplierDataOrigin} from '@/lib/suppliers/data-form';
import {issueSupplierDataInvitation,revokeSupplierDataInvitation} from '@/lib/suppliers/data-invitations';

export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function POST(request:NextRequest){
 const session=await getSession();if(!session||!await hasAction(session.uid,'suppliers','edit'))return NextResponse.json({error:'unauthorized'},{status:403,headers});
 try{
  const origin=supplierDataOrigin();if(request.headers.get('origin')!==origin)return NextResponse.json({error:'invalid_origin'},{status:403,headers});
  const form=await request.formData(),raw=String(form.get('supplierId')||''),mode=String(form.get('mode')||'');if(!/^[1-9]\d{0,14}$/.test(raw)||!['issue','revoke'].includes(mode))throw Error();
  if(mode==='revoke'){await revokeSupplierDataInvitation(prisma,BigInt(raw),BigInt(session.uid));return NextResponse.json({status:'revoked'},{headers});}
  const result=await issueSupplierDataInvitation(prisma,BigInt(raw),BigInt(session.uid),process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'',origin);
  return NextResponse.json({url:result.url,expiresAt:result.expiresAt.toISOString(),generation:result.generation},{headers});
 }catch{return NextResponse.json({error:'invitation_unavailable'},{status:400,headers});}
}

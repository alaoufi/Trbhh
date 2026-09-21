import {NextRequest,NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {hasAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {issueMerchantInvitation} from '@/lib/suppliers/merchant-oauth';
import {readOAuthForm} from '@/lib/suppliers/oauth-form';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};

/** Administrative issuing endpoint. Never accepts caller-supplied admin identity. */
export async function POST(request:NextRequest) {
  const session=await getSession();
  if(!session||!await hasAction(session.uid,'suppliers','edit'))return NextResponse.json({error:'unauthorized'},{status:403,headers});
  try{
    const config=supplierConfig();
    if(request.headers.get('origin')!==config.origin)return NextResponse.json({error:'invalid_origin'},{status:403,headers});
    const form=await readOAuthForm(request),supplierId=form.get('supplierId')||'';
    if(!/^[1-9]\d{0,14}$/.test(supplierId))throw Error('invalid_supplier');
    const result=await issueMerchantInvitation(prisma,BigInt(supplierId),BigInt(session.uid),config);
    return NextResponse.json({url:result.url,expiresAt:result.expiresAt.toISOString()},{headers});
  }catch{return NextResponse.json({error:'invitation_unavailable'},{status:400,headers});}
}

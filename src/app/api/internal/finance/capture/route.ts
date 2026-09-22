import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {constantSecret} from '@/lib/suppliers/crypto';
import {captureInvoices} from '@/lib/finance/service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
/** Independent receipt catch-up worker; no payments, tax issue, supplier sync or external sends. */
export async function POST(request:Request){
  const secret=process.env.FINANCE_CAPTURE_SECRET||'',headers={'Cache-Control':'no-store'};
  if(secret.length<32)return NextResponse.json({error:'not_configured'},{status:503,headers});
  const auth=request.headers.get('authorization')||'';
  if(auth.length>1024||!auth.startsWith('Bearer ')||!constantSecret(auth.slice(7),secret))return NextResponse.json({error:'unauthorized'},{status:401,headers});
  try{return NextResponse.json({captured:await captureInvoices(prisma,0n)},{headers});}
  catch{return NextResponse.json({error:'finance_capture_unavailable'},{status:503,headers});}
}

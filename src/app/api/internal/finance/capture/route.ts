import {NextResponse} from 'next/server';
import {isIP} from 'node:net';
import {prisma} from '@/lib/prisma';
import {captureInvoicesForWorker} from '@/lib/finance/service';
import {withFinanceAuditContext} from '@/lib/finance/audit-context';
import {financeCaptureErrorCategory} from '@/lib/finance/capture-error';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
/** Independent receipt catch-up worker; no payments, tax issue, supplier sync or external sends. */
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store'};
  const auth=request.headers.get('authorization')||'';
  const candidate=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'').split(',')[0].trim();
  try{
    const captured=await withFinanceAuditContext({ip:isIP(candidate)?candidate:null,sessionFingerprint:null},()=>captureInvoicesForWorker(prisma,auth));
    return NextResponse.json({captured},{headers});
  }catch(error){
    const code=error instanceof Error?error.message:'';
    if(code==='finance_capture_not_configured')return NextResponse.json({error:'not_configured'},{status:503,headers});
    if(code==='finance_capture_unauthorized')return NextResponse.json({error:'unauthorized'},{status:401,headers});
    return NextResponse.json({error:'finance_capture_unavailable',category:financeCaptureErrorCategory(error)},{status:503,headers});
  }
}

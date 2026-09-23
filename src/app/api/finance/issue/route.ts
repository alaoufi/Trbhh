import {NextResponse} from 'next/server';
import {isIP} from 'node:net';
import {prisma} from '@/lib/prisma';
import {issueInvoicesForWorker} from '@/lib/finance/issuance';
import {withFinanceAuditContext} from '@/lib/finance/audit-context';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
/** The service authenticates the dedicated worker and rechecks each policy delegate. */
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const authorization=request.headers.get('authorization')||'';
 const candidate=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'').split(',')[0].trim();
 try{
  const result=await withFinanceAuditContext({ip:isIP(candidate)?candidate:null,sessionFingerprint:null},()=>issueInvoicesForWorker(prisma,authorization));
  if(!result||![result.issued,result.pending,result.failed].every(value=>Number.isSafeInteger(value)&&value>=0))throw Error('finance_issuance_unavailable');
  return NextResponse.json({issued:result.issued,pending:result.pending,failed:result.failed},{headers});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  if(code==='finance_issuance_not_configured')return NextResponse.json({error:'not_configured'},{status:503,headers});
  if(code==='finance_issuance_unauthorized')return NextResponse.json({error:'unauthorized'},{status:401,headers});
  return NextResponse.json({error:'finance_issuance_unavailable'},{status:503,headers});
 }
}

import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {constantSecret} from '@/lib/suppliers/crypto';
import {reconcileSuppliers} from '@/lib/suppliers/worker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';
 const headers={'Cache-Control':'no-store'};
 if(secret.length<32)return NextResponse.json({error:'not_configured'},{status:503,headers});
 const auth=request.headers.get('authorization')||'';
 if(auth.length>1024||!auth.startsWith('Bearer ')||!constantSecret(auth.slice(7),secret))return NextResponse.json({error:'unauthorized'},{status:401,headers});
 try{
  const config=supplierConfig();
  return NextResponse.json(await reconcileSuppliers(prisma,config),{headers});
 }catch{return NextResponse.json({error:'reconcile_unavailable'},{status:503,headers});}
}

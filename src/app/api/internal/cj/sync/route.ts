import {NextResponse} from 'next/server';
import {constantSecret} from '@/lib/suppliers/crypto';
import {syncCjCatalog} from '@/lib/cj/sync';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
/**
 * مزامنة كتالوج CJ المجدولة (كرون داخلي) — تحترم مفتاح cj_sync_enabled (معطّل
 * افتراضياً) فلا تستورد شيئاً حتى يفعّلها المشرف. مصادقة Bearer بنفس سر التسوية
 * الداخلي. قراءة فقط، لا شراء. ميزانية ٦٠ ثانية مستقلة عن عامل مزامنة الموردين.
 */
export async function POST(request:Request){
 const secret=process.env.SUPPLIER_RECONCILE_SECRET||'';
 const headers={'Cache-Control':'no-store'};
 if(secret.length<32)return NextResponse.json({error:'not_configured'},{status:503,headers});
 const auth=request.headers.get('authorization')||'';
 if(auth.length>1024||!auth.startsWith('Bearer ')||!constantSecret(auth.slice(7),secret))return NextResponse.json({error:'unauthorized'},{status:401,headers});
 try{return NextResponse.json(await syncCjCatalog(),{headers});}
 catch{return NextResponse.json({error:'cj_sync_unavailable'},{status:503,headers});}
}

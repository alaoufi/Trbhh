import {NextRequest,NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {parseSallaEvent,receiveSallaEvent} from '@/lib/suppliers/webhooks';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
 const secret=process.env.SALLA_WEBHOOK_SECRET||'';
 if(!secret)return NextResponse.json({error:'not_configured'},{status:503});
 if(request.headers.get('x-salla-security-strategy')!=='Signature')return NextResponse.json({error:'invalid_signature'},{status:401});
 if(Number(request.headers.get('content-length')||0)>1048576)return NextResponse.json({error:'too_large'},{status:413});
 let raw:Buffer;
 try {
  if(!request.body)throw new Error();const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();return NextResponse.json({error:'too_large'},{status:413});}parts.push(value);}raw=Buffer.concat(parts);}finally{reader.releaseLock();}
 }catch{return NextResponse.json({error:'invalid_body'},{status:400});}
 let event;try{event=parseSallaEvent(raw,request.headers.get('x-salla-signature')||'',secret);}catch{return NextResponse.json({error:'invalid_event'},{status:400});}
 try{await receiveSallaEvent(prisma,event);}catch{return NextResponse.json({error:'retry_later'},{status:503});}
 return NextResponse.json({received:true},{headers:{'Cache-Control':'no-store'}});
}

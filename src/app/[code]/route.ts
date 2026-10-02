import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** يحافظ على الروابط المختصرة القديمة، ويعيد 404 حقيقية للمسارات غير المعروفة. */
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const row=await prisma.short_links.findFirst({where:{short:code}}).catch(()=>null);
  if(!row?.route)return new NextResponse(null,{status:404,headers:{'Cache-Control':'no-store'}});
  const target=row.route.startsWith('/')?row.route:`/${row.route}`;
  return NextResponse.redirect(new URL(target,request.url),307);
}

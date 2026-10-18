import 'server-only';
import type {PrismaClient} from '@prisma/client';
import {toInt} from '@/lib/utils';
export const SERVICE_PAYMENT_REASONS=['featured','urgent','bump','classified','duplicate','subscription','store_plus','store_show','ad_show','verify_fee','lead','auction'] as const;
/** Caller must enforce the revenue payments page permission. Read failures never become zero evidence. */
export async function readServicePayments(db:Pick<PrismaClient,'wallet_txns'|'users'>,cat:string|undefined,page:number){
 try{
  const catKey=SERVICE_PAYMENT_REASONS.includes(cat as typeof SERVICE_PAYMENT_REASONS[number])?cat!:'';
  const sums=await db.wallet_txns.groupBy({by:['reason'],where:{reason:{in:[...SERVICE_PAYMENT_REASONS]},amount:{lt:0}},_sum:{amount:true},_count:{_all:true}});
  const sumBy=new Map(sums.map(g=>[g.reason,{total:Math.abs(g._sum.amount??0),n:g._count._all}]));
  const grand=[...sumBy.values()].reduce((a,b)=>a+b.total,0);
  const where={amount:{lt:0},reason:catKey?catKey:{in:[...SERVICE_PAYMENT_REASONS]}};
  const total=await db.wallet_txns.count({where}),pages=Math.max(1,Math.ceil(total/30));
  const cur=Math.min(Number.isSafeInteger(page)&&page>0?page:1,pages);
  const rows=await db.wallet_txns.findMany({where,orderBy:{id:'desc'},skip:(cur-1)*30,take:30});
  const uids=[...new Set(rows.map(r=>toInt(r.user_id)))];
  const users=uids.length?await db.users.findMany({where:{id:{in:uids.map(u=>BigInt(u))}},select:{id:true,name:true,userName:true}}):[];
  const nameById=new Map(users.map(u=>[toInt(u.id),u.name||u.userName||'#'+toInt(u.id)]));
  return {ready:true as const,catKey,sumBy,grand,total,pages,cur,rows,nameById};
 }catch{return {ready:false as const};}
}

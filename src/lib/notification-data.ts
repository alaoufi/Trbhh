import 'server-only';
import {prisma} from './prisma';
import {Prisma} from '@prisma/client';
export const storedNotificationFilter=(uid:number)=>({user_id:String(uid),OR:[{type:null},{type:{not:'message'}}]});
export const notificationPageSize=30;
const knownKinds=['comment','review','warning'];
export const notificationKindFilter=(kind:string)=>kind==='other'?{OR:[{type:null},{type:{notIn:[...knownKinds,'message']}}]}:{type:kind};
export async function notificationCounts(uid:number){
 const [messages,stored]=await Promise.all([prisma.chats.count({where:{reciver_id:uid,is_read:0}}),prisma.notfications.count({where:{...storedNotificationFilter(uid),read_at:null}})]);
 return {messages,stored,total:messages+stored};
}
export async function notificationPageData(uid:number,tab:string,page:number,messagePage:number,canView:boolean){
 const messageRead=tab==='archive'?1:0;
 const [counts,archived,archivedMessages,kinds,threadCounts]=await Promise.all([
 notificationCounts(uid),
 prisma.notfications.count({where:{...storedNotificationFilter(uid),read_at:{not:null}}}),
 prisma.chats.count({where:{reciver_id:uid,is_read:1}}),
 Promise.all([...knownKinds,'other'].map(async kind=>[kind,await prisma.notfications.count({where:{user_id:String(uid),read_at:null,...notificationKindFilter(kind)}})] as const)),
 prisma.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COUNT(DISTINCT sender_id) AS total FROM chats WHERE reciver_id = ${uid} AND is_read = ${messageRead}`),
 ]);
 const kindCounts=new Map(kinds);const storedTotal=tab==='archive'?archived:tab==='all'?counts.stored:tab==='message'?0:kindCounts.get(tab)||0;
 const pages=Math.max(1,Math.ceil(storedTotal/notificationPageSize));page=Math.min(page,pages);
 const rows=tab==='message'?[]:await prisma.notfications.findMany({where:{user_id:String(uid),read_at:tab==='archive'?{not:null}:null,...(tab==='all'||tab==='archive'?{OR:storedNotificationFilter(uid).OR}:notificationKindFilter(tab))},orderBy:{id:'desc'},take:notificationPageSize,skip:(page-1)*notificationPageSize});
 const threadTotal=Number(threadCounts[0]?.total||0);const messagePages=Math.max(1,Math.ceil(threadTotal/notificationPageSize));messagePage=Math.min(messagePage,messagePages);
 const groups=(tab==='all'||tab==='message'||tab==='archive')?await prisma.chats.groupBy({by:['sender_id'],where:{reciver_id:uid,is_read:messageRead},_count:{_all:true},_max:{id:true},orderBy:{_max:{id:'desc'}},take:notificationPageSize,skip:(messagePage-1)*notificationPageSize}):[];
 const senderIds=groups.map(g=>g.sender_id);
 const [latest,senders]=canView&&groups.length?await Promise.all([
 prisma.chats.findMany({where:{reciver_id:uid,is_read:messageRead,id:{in:groups.flatMap(g=>g._max.id===null?[]:[g._max.id])}},select:{sender_id:true,message:true,created_at:true},take:notificationPageSize}),
 prisma.users.findMany({where:{id:{in:senderIds.map(id=>BigInt(id))}},select:{id:true,name:true,userName:true},take:notificationPageSize}),
 ]):[[],[]];
 const senderName=new Map(senders.map(u=>[Number(u.id),u.name||u.userName||'عضو']));
 const threads=groups.map(g=>{const last=latest.find(m=>m.sender_id===g.sender_id);return {id:g.sender_id,name:senderName.get(g.sender_id)||'عضو',exists:senderName.has(g.sender_id),count:g._count._all,last:last?.message||'',at:last?.created_at||null};});
 return {counts,archived,archiveBadge:archived+archivedMessages,kindCounts,storedTotal,rows,page,pages,threads,threadTotal,messagePage,messagePages};
}

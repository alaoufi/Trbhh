import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getSession} from '@/lib/auth';
import {canUseMemberChat} from '@/lib/chat-access';
import {prisma} from '@/lib/prisma';
import {AdminPager} from '@/components/admin-pager';
import {readMessageNotificationAction} from '../../actions';
export const dynamic='force-dynamic';
export default async function MessageNotification({params,searchParams}:{params:Promise<{senderId:string}>;searchParams?:Promise<{page?:string}>}){
 const session=await getSession();if(!session)redirect('/login');
 if(!await canUseMemberChat(session.uid,'view'))redirect('/notifications?tab=message');
 const {senderId}=await params;if(!/^\d+$/.test(senderId))redirect('/notifications');const sender=Number(senderId);
 if(!Number.isSafeInteger(sender)||sender<0)redirect('/notifications');
 const total=await prisma.chats.count({where:{reciver_id:session.uid,sender_id:sender}});const pages=Math.max(1,Math.ceil(total/30));const page=Math.min(pages,Math.max(1,parseInt((await searchParams)?.page||'1')||1));
 const messages=await prisma.chats.findMany({where:{reciver_id:session.uid,sender_id:sender},orderBy:{id:'desc'},take:30,skip:(page-1)*30});
 return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-xl font-bold">تفاصيل تنبيه الرسائل</h1><p className="text-sm text-muted-foreground">سجل الرسائل التي وصلت إلى حسابك من هذا المرسل. يبقى السجل متاحاً بعد تعليم الرسائل كمقروءة.</p>{messages.map(m=><div key={m.id} className="rounded-xl border p-4 whitespace-pre-wrap break-words">{m.message}</div>)}<form action={readMessageNotificationAction}><input type="hidden" name="sender" value={sender}/><button className="btn-primary">تعليم جميع رسائل المرسل كمقروءة</button></form><AdminPager basePath={`/notifications/messages/${sender}`} page={page} pages={pages} total={total} params={{}}/><Link href="/notifications">العودة للتنبيهات</Link></div>;
}

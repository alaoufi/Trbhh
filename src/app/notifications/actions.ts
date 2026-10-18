'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {notificationId,safeNotificationRoute} from '@/lib/notification-policy';
import {canUseMemberChat} from '@/lib/chat-access';
export async function openNotifAction(formData:FormData){
 const session=await requireUser();const id=notificationId(formData.get('id'));
 if(!id)redirect('/notifications');
 const row=await prisma.notfications.findFirst({where:{id,user_id:String(session.uid)}});
 if(!row)redirect('/notifications');
 await prisma.notfications.updateMany({where:{id,user_id:String(session.uid),read_at:null},data:{read_at:new Date()}});
 const destination=safeNotificationRoute(row.route);
 revalidatePath('/','layout');redirect(destination==='/notifications'?'/notifications?tab=archive&notice=source-unavailable':destination);
}
export async function readMessageNotificationAction(formData:FormData){
 const session=await requireUser();const raw=formData.get('sender');if(typeof raw!=='string'||!/^\d+$/.test(raw))redirect('/notifications');const sender=Number(raw);
 if(!Number.isSafeInteger(sender)||sender<0||!await canUseMemberChat(session.uid,'view'))redirect('/notifications');
 await prisma.chats.updateMany({where:{reciver_id:session.uid,sender_id:sender,is_read:0},data:{is_read:1}});
 revalidatePath('/','layout');redirect('/notifications');
}
export async function archiveAllNotifsAction(){
 const session=await requireUser();
 await prisma.notfications.updateMany({where:{user_id:String(session.uid),read_at:null},data:{read_at:new Date()}});
 revalidatePath('/','layout');redirect('/notifications');
}

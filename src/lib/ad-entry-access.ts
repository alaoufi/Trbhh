import 'server-only';
import {prisma} from './prisma';
import {getBanInfo} from './moderation';
import {getUserPackage,countAdsToday,lastAdAt} from './packages';
import {getActiveStoreId,staffStoreId} from './merchant';
import {isStoreSubBlocked} from './subscription';

export type AdEntryBlock = {code:string;message:string;href:string;label:string;topup?:boolean};
/** Read existing eligibility rules before rendering any fields. No charge or moderation strike. */
export async function getAdEntryAccess(userId:number,asStore:boolean):Promise<AdEntryBlock|null> {
 const user=await prisma.users.findUnique({where:{id:BigInt(userId)},select:{archived_at:true}});
 if(!user||user.archived_at)return {code:'account',message:'هذا الحساب غير متاح للنشر.',href:'/login',label:'تسجيل الدخول'};
 const ban=await getBanInfo(userId);
 if(ban)return {code:'banned',message:`النشر غير مسموح: الحساب محظور${ban.reason ? ` — ${ban.reason}` : ''}.`,href:'/pages/contact',label:'التواصل مع الإدارة'};
 if(asStore){
   const sid=await getActiveStoreId(userId)||await staffStoreId(userId);
   const store=sid ? await prisma.stores.findUnique({where:{id:BigInt(sid)},select:{status:true}}) : null;
   if(!store||store.status!==1)return {code:'store',message:!store?'لا تملك صلاحية النشر باسم هذا المتجر.':store.status===0?'المتجر بانتظار اعتماد الإدارة.':'النشر غير مسموح: المتجر موقوف.',href:'/store',label:'إدارة المتجر'};
   if(await isStoreSubBlocked(sid))return {code:'subscription',message:'اشتراك المتجر منتهٍ. جدّد الاشتراك؛ وإذا كان الرصيد لا يكفي، اشحن المحفظة أولًا.',href:'/store?sub=expired&from=ad#sub',label:'تجديد الاشتراك',topup:true};
 }
 const pkg=await getUserPackage(userId);
 if(pkg.adsPerDay>0&&await countAdsToday(userId)>=pkg.adsPerDay)return {code:'quota',message:`استُخدم العدد المسموح اليوم (${pkg.adsPerDay} إعلان). انتظر تجدد الرصيد اليومي أو اختر باقة مناسبة. رصيد المحفظة وحده لا يزيد عدد الإعلانات دون اشتراك.`,href:'/packages',label:'اختيار باقة',topup:true};
 if(pkg.gapHours>0){
   const last=await lastAdAt(userId);
   const remaining=last ? new Date(last).getTime()+pkg.gapHours*3600000-Date.now() : 0;
   if(remaining>0)return {code:'gap',message:`يلزم الانتظار نحو ${Math.ceil(remaining/60000)} دقيقة حسب الفاصل بين الإعلانات في باقتك.`,href:'/packages',label:'عرض الباقات'};
 }
 return null;
}

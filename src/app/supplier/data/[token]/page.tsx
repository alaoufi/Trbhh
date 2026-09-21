import {SupplierDataForm} from '@/components/supplier-data-form';
import {prisma} from '@/lib/prisma';
import {resolveSupplierDataInvitation} from '@/lib/suppliers/data-invitations';

export const dynamic='force-dynamic';
export const metadata={title:'بيانات المورد | تربح',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function SupplierDataPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {token}=await params,query=await searchParams;
 let invitation:Awaited<ReturnType<typeof resolveSupplierDataInvitation>>|null=null;
 try{invitation=await resolveSupplierDataInvitation(prisma,token,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'');}catch{}
 if(!invitation)return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#faf9f6] p-6 text-[#16294A]"><section className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-black">الرابط غير صالح أو انتهت مدته</h1><p className="mt-3 leading-8">اطلب من إدارة تربح إصدار رابط بيانات جديد. هذا الرابط لا يتيح الوصول إلى أي لوحة أو بيانات إدارية.</p></section></main>;
 return <SupplierDataForm token={token} supplierName={invitation.supplierName} status={invitation.status} values={invitation.values} saved={query.saved==='1'} error={typeof query.error==='string'?query.error:undefined}/>;
}

'use server';
import {requireUser} from '@/lib/auth';
import {confirmCjOrderReceipt} from '@/lib/cj/fulfillment/receipt';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
export async function confirmCjReceipt(form:FormData):Promise<void>{
 const user=await requireUser();
 const id=String(form.get('orderId')||'');
 if(!/^[1-9]\d{0,14}$/.test(id)||form.get('confirm')!=='1')throw Error('invalid_confirmation');
 const result=await confirmCjOrderReceipt(BigInt(id),BigInt(user.uid));
 if(!result.ok)redirect(`/account/orders/${id}?receipt=unverified`);
 revalidatePath(`/account/orders/${id}`);
 redirect(`/account/orders/${id}?receipt=confirmed`);
}
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({user:vi.fn(),receipt:vi.fn(),revalidate:vi.fn(),redirect:vi.fn((s:string)=>{throw Error(s);})}));
vi.mock('@/lib/auth',()=>({requireUser:mock.user}));
vi.mock('@/lib/cj/fulfillment/receipt',()=>({confirmCjOrderReceipt:mock.receipt}));
vi.mock('next/cache',()=>({revalidatePath:mock.revalidate}));
vi.mock('next/navigation',()=>({redirect:mock.redirect}));
import {confirmCjReceipt} from '@/app/account/orders/receipt-action';
const form=(confirmed=true)=>{const f=new FormData();f.set('orderId','123');if(confirmed)f.set('confirm','1');return f;};
beforeEach(()=>{vi.clearAllMocks();mock.user.mockResolvedValue({uid:8});mock.receipt.mockResolvedValue({ok:true,alreadyCompleted:false});});
describe('owned CJ receipt confirmation',()=>{
 it('binds confirmation to authenticated owner and refreshes the same order',async()=>{await expect(confirmCjReceipt(form())).rejects.toThrow('/account/orders/123?receipt=confirmed');expect(mock.receipt).toHaveBeenCalledExactlyOnceWith(123n,8n);expect(mock.revalidate).toHaveBeenCalledWith('/account/orders/123');});
 it('requires explicit receipt confirmation before any storage operation',async()=>{await expect(confirmCjReceipt(form(false))).rejects.toThrow('invalid_confirmation');expect(mock.receipt).not.toHaveBeenCalled();});
 it('does not report completion when delivery evidence is missing',async()=>{mock.receipt.mockResolvedValue({ok:false,reason:'delivery_unverified'});await expect(confirmCjReceipt(form())).rejects.toThrow('/account/orders/123?receipt=unverified');expect(mock.revalidate).not.toHaveBeenCalled();});
});
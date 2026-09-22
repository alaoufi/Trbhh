import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({requireFinance:vi.fn(),recordExpense:vi.fn(),saveBudget:vi.fn(),approveSettlement:vi.fn(),closeMonth:vi.fn(),revalidatePath:vi.fn()}));
vi.mock('@/lib/finance/permissions',()=>({requireFinance:mocks.requireFinance}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url);}}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidatePath}));
vi.mock('@/lib/finance/service',async importOriginal=>({...await importOriginal<object>(),recordExpense:mocks.recordExpense,saveBudget:mocks.saveBudget,approveSettlement:mocks.approveSettlement,closeMonth:mocks.closeMonth}));
import {saveFinanceBudget,approveFinanceSettlement,recordFinanceExpense,closeFinanceMonth} from '@/app/admin/finance/actions';
const form=(values:Record<string,string>)=>{const result=new FormData();for(const [key,value] of Object.entries(values))result.set(key,value);return result;};
beforeEach(()=>{vi.clearAllMocks();mocks.requireFinance.mockResolvedValue({uid:9});});
describe('finance server action authorization',()=>{
 it('requires exact approval permission before accepting transfer evidence',async()=>{
   mocks.requireFinance.mockRejectedValue(new Error('DENIED'));
   await expect(approveFinanceSettlement(form({month:'2026-09',settlementId:'1',reference:'ref',confirm:'1'}))).rejects.toThrow('DENIED');
   expect(mocks.requireFinance).toHaveBeenCalledWith('approve');expect(mocks.approveSettlement).not.toHaveBeenCalled();
 });
 it('cannot redirect to a supplied external URL and validates exact money',async()=>{
   await expect(saveFinanceBudget(form({month:'2026-09',category:'hosting',planned:'1.001',returnTo:'https://evil.test'}))).rejects.toThrow('REDIRECT:/admin/finance?section=overview');
   expect(mocks.saveBudget).not.toHaveBeenCalled();
 });
 it('cannot quietly post the expense into a different month',async()=>{
   await expect(recordFinanceExpense(form({month:'2026-09',occurredAt:'2026-08-20'}))).rejects.toThrow('finance_date_invalid');
   expect(mocks.recordExpense).not.toHaveBeenCalled();
 });
 it('requires close permission independently from edit',async()=>{
   await expect(closeFinanceMonth(form({month:'2026-08',reason:'راجعت المصادر'}))).rejects.toThrow('REDIRECT:');
   expect(mocks.requireFinance).toHaveBeenCalledWith('close');
 });
});

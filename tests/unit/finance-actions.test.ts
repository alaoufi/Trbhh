import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({restoreDraftInvoice:vi.fn(),requireAccess:vi.fn(),accessActor:vi.fn(),requestFinanceChange:vi.fn(),readFinanceChangeKind:vi.fn(),approveFinanceChange:vi.fn(),cancelFinanceChange:vi.fn(),recordExpense:vi.fn(),saveBudget:vi.fn(),approveSettlement:vi.fn(),closeMonth:vi.fn(),revalidatePath:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mocks.requireAccess,accessActor:mocks.accessActor}));
vi.mock('@/lib/finance/workflows',()=>({requestFinanceChange:mocks.requestFinanceChange,readFinanceChangeKind:mocks.readFinanceChangeKind,approveFinanceChange:mocks.approveFinanceChange,cancelFinanceChange:mocks.cancelFinanceChange}));
vi.mock('@/lib/roles',()=>({requireAction:async()=>({uid:9})}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url);}}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidatePath}));
vi.mock('@/lib/finance/service',async importOriginal=>({...await importOriginal<object>(),restoreDraftInvoice:mocks.restoreDraftInvoice,recordExpense:mocks.recordExpense,saveBudget:mocks.saveBudget,approveSettlement:mocks.approveSettlement,closeMonth:mocks.closeMonth}));
import {financeAuditContext} from '@/lib/finance/audit-context';
import {saveFinanceBudget,approveFinanceSettlement,recordFinanceExpense,closeFinanceMonth,requestFinanceReturn,requestFinanceTaxSettings,requestFinancePeriodReopen,approveFinanceRequest,cancelFinanceRequest,restoreFinanceDraftInvoice} from '@/app/admin/finance/actions';
const form=(values:Record<string,string>)=>{const result=new FormData();for(const [key,value] of Object.entries(values))result.set(key,value);return result;};
beforeEach(()=>{vi.clearAllMocks();mocks.requireAccess.mockResolvedValue({uid:9});mocks.accessActor.mockResolvedValue({userId:9,ip:'127.0.0.1',sessionFingerprint:'hashed-session'});});
describe('finance server action authorization',()=>{
 it('requires exact approval permission before accepting transfer evidence',async()=>{
   mocks.requireAccess.mockRejectedValue(new Error('DENIED'));
   await expect(approveFinanceSettlement(form({month:'2026-09',settlementId:'1',reference:'ref',confirm:'1'}))).rejects.toThrow('DENIED');
   expect(mocks.requireAccess).toHaveBeenCalledWith('settlements','view');expect(mocks.approveSettlement).not.toHaveBeenCalled();
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
   expect(mocks.requireAccess).toHaveBeenCalledWith('periods','close_period');
 });
 it('a settlement viewer cannot call approval directly',async()=>{
   mocks.requireAccess.mockImplementation(async (_module:string,action:string)=>{if(action!=='view')throw Error('DENIED');return {uid:9};});
   await expect(approveFinanceSettlement(form({month:'2026-09',settlementId:'1',reference:'ref',confirm:'1'}))).rejects.toThrow('DENIED');
   expect(mocks.requireAccess).toHaveBeenCalledWith('settlements','approve');expect(mocks.approveSettlement).not.toHaveBeenCalled();
 });
});

describe('finance maker and checker action contracts',()=>{
 it('never reads a request before the exact approval permission succeeds',async()=>{
  mocks.requireAccess.mockImplementation(async (_module:string,action:string)=>{if(action==='approve')throw Error('DENIED');return {uid:9};});
  await expect(approveFinanceRequest(form({month:'2026-09',kind:'return',changeId:'2',reason:'review evidence'}))).rejects.toThrow('DENIED');
  expect(mocks.requireAccess.mock.calls).toEqual([['returns','view'],['returns','approve']]);
  expect(mocks.readFinanceChangeKind).not.toHaveBeenCalled();
 });
 it('rejects a forged kind even when the submitted module is authorized',async()=>{
  mocks.readFinanceChangeKind.mockResolvedValue('tax_settings');
  await expect(approveFinanceRequest(form({month:'2026-09',returnTo:'returns',kind:'return',changeId:'2',reason:'review evidence'}))).rejects.toThrow('finance_change_missing');
  expect(mocks.approveFinanceChange).not.toHaveBeenCalled();
 });
 it('passes only selected quantities and source identity for a return, never client money',async()=>{
  const input=form({month:'2026-09',returnTo:'returns',invoiceId:'1',reason:'return evidence',requestKey:'request-test-1','quantity:product-1':'2',totalMinor:'999999'});input.append('lineKeys','product-1');
  await expect(requestFinanceReturn(input)).rejects.toThrow('saved=1');
  expect(mocks.requireAccess).toHaveBeenCalledWith('returns','create');
  expect(mocks.requestFinanceChange).toHaveBeenCalledWith({},9n,{kind:'return',targetId:'1',payload:{lines:[{key:'product-1',quantity:2}]},reason:'return evidence',requestKey:'request-test-1'});
 });
 it('keeps fractional return quantities out of the service',async()=>{
  const input=form({month:'2026-09',invoiceId:'1','quantity:product-1':'0.5'});input.append('lineKeys','product-1');
  await expect(requestFinanceReturn(input)).rejects.toThrow('finance_quantity_invalid');
  expect(mocks.requestFinanceChange).not.toHaveBeenCalled();
 });
 it('preserves exact tax decimal basis points and future policy fields',async()=>{
  await expect(requestFinanceTaxSettings(form({month:'2026-09',effectiveFrom:'2026-10-01',issuerName:'Issuer',issuerTaxNumber:'300000000000003',issuerAddress:'Address',vatPercent:'15.25',policyReference:'approved-policy',reason:'policy review',requestKey:'request-test-2'}))).rejects.toThrow('saved=1');
  expect(mocks.requireAccess).toHaveBeenCalledWith('tax','manage_settings');
  expect(mocks.requestFinanceChange.mock.calls[0][2].payload.vatBps).toBe(1525);
 });
 it('cancels requests through their exact module grant and stored kind',async()=>{
  mocks.readFinanceChangeKind.mockResolvedValue('return');
  await expect(cancelFinanceRequest(form({month:'2026-09',kind:'return',changeId:'2',reason:'cancel duplicate'}))).rejects.toThrow('saved=1');
  expect(mocks.requireAccess).toHaveBeenCalledWith('returns','delete');expect(mocks.cancelFinanceChange).toHaveBeenCalledWith({},9n,2n,'cancel duplicate');
 });
 it('reopening passes a version and requires reopen permission rather than close permission',async()=>{
  await expect(requestFinancePeriodReopen(form({month:'2026-08',expectedVersion:'3',reason:'correction review',requestKey:'request-test-3'}))).rejects.toThrow('saved=1');
  expect(mocks.requireAccess).toHaveBeenCalledWith('periods','reopen_period');expect(mocks.requestFinanceChange.mock.calls[0][2].payload).toEqual({expectedVersion:3});
 });
 it('wraps monetary writes in server-derived audit metadata and preserves the reason',async()=>{
  let context:unknown; mocks.saveBudget.mockImplementation(async()=>{context=financeAuditContext();});
  await expect(saveFinanceBudget(form({month:'2026-09',category:'hosting',planned:'100',reason:'hosting renewal'}))).rejects.toThrow('saved=1');
  expect(context).toEqual({ip:'127.0.0.1',sessionFingerprint:'hashed-session'});
  expect(mocks.saveBudget.mock.calls[0][2].reason).toBe('hosting renewal');
 });
});

it('restoration requires both deletion and creation before restoring the existing invoice',async()=>{
 mocks.requireAccess.mockImplementation(async (_module:string,action:string)=>{if(action==='create')throw Error('DENIED');return {uid:9};});
 await expect(restoreFinanceDraftInvoice(form({month:'2026-09',invoiceId:'1',reason:'correct mistaken cancellation'}))).rejects.toThrow('finance_action_failed');
 expect(mocks.requireAccess.mock.calls).toEqual([['invoices','view'],['invoices','delete'],['invoices','create']]);expect(mocks.restoreDraftInvoice).not.toHaveBeenCalled();
 mocks.requireAccess.mockResolvedValue({uid:9});
 await expect(restoreFinanceDraftInvoice(form({month:'2026-09',invoiceId:'1',reason:'correct mistaken cancellation'}))).rejects.toThrow('saved=1');
 expect(mocks.restoreDraftInvoice).toHaveBeenCalledWith({},9n,1n,'correct mistaken cancellation');
});

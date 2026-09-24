import {describe,it,expect} from 'vitest';
import {buildReturnSnapshot,validateFinanceChange} from '@/lib/finance/workflows';
import {withFinanceAuditContext,financeAuditContext} from '@/lib/finance/audit-context';
import {calculateFiscalLines} from '@/lib/finance/calculations';
import type {FiscalSnapshot} from '@/lib/finance/types';
const original=():FiscalSnapshot=>({version:1,issuer:{name:'شركة اختبار',taxNumber:'300000000000003',address:'الرياض'},customer:{name:'عميل اختبار',address:'الرياض'},currency:'SAR',...calculateFiscalLines([{key:'7',title:'منتج',quantity:2,unitNetMinor:10000,discountMinor:0,vatBps:1500,supplierId:'1',supplierMinor:12000}]),paidMinor:23000,sourceOrderId:'1',sourceReceiptId:'1',policyReference:'original-policy'});
describe('reviewed financial changes',()=>{
 it('derives partial return money and tax exclusively from the issued snapshot',()=>{
  const result=buildReturnSnapshot(original(),[],{lines:[{key:'7',quantity:1}]});
  expect(result.totalMinor).toBe(11500);expect(result.vatMinor).toBe(1500);expect(result.lines[0].supplierMinor).toBe(6000);expect(result.policyReference).toBe('original-policy');
 });
 it('rejects duplicate, unknown, excessive or fractional returned units',()=>{
  for(const lines of [[{key:'7',quantity:1},{key:'7',quantity:1}],[{key:'x',quantity:1}],[{key:'7',quantity:3}],[{key:'7',quantity:.5}]])expect(()=>buildReturnSnapshot(original(),[],{lines})).toThrow();
 });
 it('accounts for already credited units before approving another return',()=>{
  const first=buildReturnSnapshot(original(),[],{lines:[{key:'7',quantity:1}]});
  expect(()=>buildReturnSnapshot(original(),[{kind:'credit_note',snapshot:first}],{lines:[{key:'7',quantity:2}]})).toThrow();
  expect(buildReturnSnapshot(original(),[{kind:'credit_note',snapshot:first}],{lines:[{key:'7',quantity:1}]}).totalMinor).toBe(11500);
 });
 it('rejects a partial split that would strand a VAT halala, while a full return reconciles exactly',()=>{
  const source={...original(),...calculateFiscalLines([{key:'7',title:'منتج',quantity:2,unitNetMinor:3,discountMinor:0,vatBps:1500,supplierId:'1',supplierMinor:4}]),paidMinor:7};
  expect(()=>buildReturnSnapshot(source,[],{lines:[{key:'7',quantity:1}]})).toThrow('finance_return_rounding_review');
  const full=buildReturnSnapshot(source,[],{lines:[{key:'7',quantity:2}]});
  expect(full).toMatchObject({totalMinor:7,netMinor:6,vatMinor:1});
 });
 it('tax policy must be explicit and never backdated before today in Riyadh, and reopen carries a version',()=>{
  const base={kind:'tax_settings' as const,targetId:'tax',reason:'approved future policy',requestKey:'tax-test-001',payload:{effectiveFrom:'2026-10-01',issuer:original().issuer,vatBps:1500,policyReference:'tax-policy-2'}};
  expect(()=>validateFinanceChange(base,new Date('2026-09-22'))).not.toThrow();
  expect(()=>validateFinanceChange({...base,payload:{...base.payload,effectiveFrom:'2026-09-22'}},new Date('2026-09-22'))).not.toThrow();
  expect(()=>validateFinanceChange({...base,payload:{...base.payload,effectiveFrom:'2026-09-21'}},new Date('2026-09-22'))).toThrow();
  expect(()=>validateFinanceChange({...base,payload:{...base.payload,vatBps:undefined}},new Date('2026-09-22'))).toThrow();
  expect(()=>validateFinanceChange({kind:'reopen_period',targetId:'2026-08',payload:{expectedVersion:-1},reason:'review',requestKey:'reopen-test-001'})).toThrow();
 });
 it('request-local audit context does not leak across concurrent requests',async()=>{
  const values=await Promise.all(['one','two'].map(sessionFingerprint=>withFinanceAuditContext({ip:'127.0.0.1',sessionFingerprint},async()=>{await Promise.resolve();return financeAuditContext();})));
  expect(values.map(v=>v.sessionFingerprint)).toEqual(['one','two']);expect(financeAuditContext()).toEqual({ip:null,sessionFingerprint:null});
 });
});

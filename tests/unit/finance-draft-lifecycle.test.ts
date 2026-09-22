import {beforeEach,describe,expect,it,vi} from 'vitest';
const gate=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:gate,enforceFinanceChecker:vi.fn()}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:async()=>{}}));
import {restoreDraftInvoice} from '@/lib/finance/service';
beforeEach(()=>{gate.mockReset();gate.mockResolvedValue(undefined);});
describe('cancelled invoice corrective review',()=>{
 it('requires both create and cancel authority before any financial writes',async()=>{
  gate.mockImplementation(async(_tx,actor,key)=>{if(key==='invoices:delete')throw Error('access_forbidden');});
  const execute=vi.fn(),tx={$executeRaw:execute};const db={$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)};
  await expect(restoreDraftInvoice(db as never,71n,1n,'corrective review')).rejects.toThrow('access_forbidden');expect(execute).not.toHaveBeenCalled();
 });
 it('restores only an unnumbered cancelled draft while preserving immutable source columns',async()=>{
  const statements:string[]=[];
  const row={status:'cancelled',kind:'invoice',number:null,snapshot:null,reason:'cancelled reason'};
  const tx={$queryRaw:async(sql:TemplateStringsArray)=>{const query=sql.join('?');if(query.includes('SELECT created_at'))return [{created_at:new Date('2026-08-01')}];if(query.includes('finance_periods'))return [{closed_at:null,version:0,checks_json:[],reason:''}];return [row];},$executeRaw:async(sql:TemplateStringsArray)=>{statements.push(sql.join('?'));return 1;}};
  const db={$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)};
  await restoreDraftInvoice(db as never,71n,1n,'corrective review',new Date('2026-09-22'));
  expect(gate.mock.calls.map(call=>call[2])).toEqual(['invoices:create','invoices:delete']);
  const update=statements.find(sql=>sql.startsWith('UPDATE finance_invoices'))!;
  expect(update).toContain("status='pending_policy'");expect(update).not.toMatch(/source_snapshot|total_minor|receipt_id|source_key/);
  expect(statements.some(sql=>sql.includes('finance_audit'))).toBe(true);
  row.number='INV-1' as never;
  await expect(restoreDraftInvoice(db as never,71n,1n,'review again')).rejects.toThrow('finance_invoice_state');
 });
});

import {describe,expect,it,vi} from 'vitest';
import {FINANCE_TABLES,financeSchemaAvailable,assertFinanceSchemaReady} from '@/lib/finance/schema';

function fixture(){
 const table='finance_order_fiscal_snapshots';
 const state={
  tables:FINANCE_TABLES.map(name=>({name,engine:'InnoDB'})),
  columns:[
   {t:'finance_tax_policies',c:'calculation_policy',type:'json',nullable:'YES',def:null,extra:''},
   ...[['order_id','bigint unsigned'],['policy_id','bigint unsigned'],['request_id','bigint unsigned'],['captured_at','datetime(3)'],['fingerprint','char(64)'],['snapshot','json']].map(([c,type])=>({t:table,c,type,nullable:'NO',def:null,extra:''})),
  ],
  keys:[...['finance_expense_request','finance_expense_reversal','finance_settlement_request','finance_settlement_reversal','finance_invoice_source','finance_invoice_number','finance_refund_provider_reference','finance_reconciliation_request','finance_change_request','finance_tax_request'].map(name=>({t:'finance_invoices',name,c:'id',seq:1,non_unique:0,prefix:null as number|null})),...['effective','reference'].map((kind)=>({t:'finance_tax_policies',name:'finance_tax_'+kind+'_lookup',c:kind==='effective'?'effective_from':'policy_reference',seq:1,non_unique:1,prefix:null as number|null})),{t:table,name:'PRIMARY',c:'order_id',seq:1,non_unique:0,prefix:null as number|null}],
  relations:[['order_id','commerce_orders'],['policy_id','finance_tax_policies'],['request_id','finance_change_requests']].map(([c,p])=>({c,p,r:'id',local_parent:1,deletion:'RESTRICT',updates:'RESTRICT'})),
 };
 const db={$queryRaw:vi.fn(async(sql:TemplateStringsArray)=>{
  const text=sql.join('?');
  if(text.includes('information_schema.TABLES'))return state.tables;
  if(text.includes('information_schema.COLUMNS'))return state.columns;
  if(text.includes('information_schema.STATISTICS'))return state.keys;
  if(text.includes('information_schema.KEY_COLUMN_USAGE'))return state.relations;
  throw Error('unexpected_schema_query');
 })};
 return {state,db};
}
describe('prospective finance schema readiness',()=>{
 it.each(['missing','unique','legacyRemaining','prefix','wrongColumn'] as const)('rejects %s tax revision index',async mode=>{
  const f=fixture(),key=f.state.keys.find(row=>row.name==='finance_tax_effective_lookup')!;
  if(mode==='missing')f.state.keys=f.state.keys.filter(row=>row!==key);else if(mode==='unique')key.non_unique=0;else if(mode==='legacyRemaining')f.state.keys.push({...key,name:'finance_tax_effective',non_unique:0});else if(mode==='prefix')key.prefix=3;else key.c='request_id';
  await expect(assertFinanceSchemaReady(f.db as never)).rejects.toThrow('finance_schema_not_ready');
 });
 it('accepts complete additive V2 columns, one order primary key and restrictive local relations',async()=>{
  const f=fixture();expect(await financeSchemaAvailable(f.db as never)).toBe(true);await expect(assertFinanceSchemaReady(f.db as never)).resolves.toBeUndefined();
 });
 it.each(['table','engine','policyMissing','policyText','policyNotNull','policyDefault','snapshotMissing','snapshotNullable','snapshotType','generated'] as const)('fails closed for %s before reading finance payloads',async mode=>{
  const f=fixture();
  if(mode==='table')f.state.tables.pop();
  else if(mode==='engine')f.state.tables[0].engine='MyISAM';
  else if(mode==='policyMissing')f.state.columns.shift();
  else if(mode==='policyText')f.state.columns[0].type='longtext';
  else if(mode==='policyNotNull')f.state.columns[0].nullable='NO';
  else if(mode==='policyDefault')Object.assign(f.state.columns[0],{def:'{}'});
  else if(mode==='snapshotMissing')f.state.columns.pop();
  else if(mode==='snapshotNullable')f.state.columns[1].nullable='YES';
  else if(mode==='snapshotType')f.state.columns[4].type='datetime';
  else f.state.columns[1].extra='STORED GENERATED';
  expect(await financeSchemaAvailable(f.db as never)).toBe(false);await expect(assertFinanceSchemaReady(f.db as never)).rejects.toThrow('finance_schema_not_ready');
 });
 it.each(['missing','wrongColumn','nonUnique','prefix','composite'] as const)('rejects %s order snapshot primary key',async mode=>{
  const f=fixture(),key=f.state.keys.at(-1)!;
  if(mode==='missing')f.state.keys.pop();else if(mode==='wrongColumn')key.c='policy_id';else if(mode==='nonUnique')key.non_unique=1;else if(mode==='prefix')key.prefix=4;else f.state.keys.push({...key,c:'policy_id',seq:2});
  await expect(assertFinanceSchemaReady(f.db as never)).rejects.toThrow('finance_schema_not_ready');
 });
 it.each(['missing','wrongParent','crossDatabase','cascadeDelete','cascadeUpdate'] as const)('rejects %s fiscal snapshot relation',async mode=>{
  const f=fixture(),relation=f.state.relations[0];
  if(mode==='missing')f.state.relations.pop();else if(mode==='wrongParent')relation.p='users';else if(mode==='crossDatabase')relation.local_parent=0;else if(mode==='cascadeDelete')relation.deletion='CASCADE';else relation.updates='CASCADE';
  await expect(assertFinanceSchemaReady(f.db as never)).rejects.toThrow('finance_schema_not_ready');
 });
 it('accepts equivalent NO ACTION restrictive relations',async()=>{
  const f=fixture();for(const row of f.state.relations){row.deletion='NO ACTION';row.updates='NO ACTION';}await expect(assertFinanceSchemaReady(f.db as never)).resolves.toBeUndefined();
 });
 it('returns a sanitized readiness failure when metadata cannot be read',async()=>{
  const f=fixture();f.db.$queryRaw.mockRejectedValue(Error('private database diagnostics'));
  expect(await financeSchemaAvailable(f.db as never)).toBe(false);await expect(assertFinanceSchemaReady(f.db as never)).rejects.toThrow(/^finance_schema_not_ready$/);
 });
});

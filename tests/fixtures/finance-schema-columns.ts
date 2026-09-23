/** Synthetic physical metadata for read-projection tests, independent of production DDL. */
export function financeSchemaColumns(){
 return [
  {t:'finance_tax_policies',c:'calculation_policy',type:'json',nullable:'YES',def:null,extra:''},
  ...[['order_id','bigint unsigned'],['policy_id','bigint unsigned'],['request_id','bigint unsigned'],['captured_at','datetime(3)'],['fingerprint','char(64)'],['snapshot','json']].map(([c,type])=>({t:'finance_order_fiscal_snapshots',c,type,nullable:'NO',def:null,extra:''})),
 ];
}

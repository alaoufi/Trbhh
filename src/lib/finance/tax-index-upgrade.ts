import 'server-only';
import type {PrismaClient} from '@prisma/client';

export type TaxPolicyIndex={name:string;c:string;seq:number;non_unique:number|bigint;prefix:number|null};
const revisions=[
 {legacy:'finance_tax_effective',replacement:'finance_tax_effective_lookup',column:'effective_from'},
 {legacy:'finance_tax_reference',replacement:'finance_tax_reference_lookup',column:'policy_reference'},
] as const;
function exact(rows:TaxPolicyIndex[],name:string,column:string,unique:boolean){
 const matching=rows.filter(row=>row.name===name);
 return matching.length===1&&matching[0].c===column&&Number(matching[0].seq)===1&&Number(matching[0].non_unique)===(unique?0:1)&&matching[0].prefix===null;
}
export function financeTaxRevisionIndexesReady(rows:TaxPolicyIndex[]):boolean{
 return revisions.every(({legacy,replacement,column})=>
  !rows.some(row=>row.name===legacy)&&exact(rows,replacement,column,false)&&
  !rows.some(row=>row.c===column&&Number(row.non_unique)===0));
}
/** Immutable policy IDs/request uniqueness remain intact. Only the two reviewed
 * date/reference restrictions are replaced; no row/column is changed or removed.
 * A single atomic MySQL ALTER also avoids an intermediate unindexed state. */
export async function ensureFinanceTaxRevisionIndexes(db:Pick<PrismaClient,'$queryRaw'|'$executeRawUnsafe'>):Promise<void>{
 const read=()=>db.$queryRaw<TaxPolicyIndex[]>`SELECT INDEX_NAME AS name,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq,NON_UNIQUE AS non_unique,SUB_PART AS prefix FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='finance_tax_policies'`;
 try{
  const rows=await read();
  if(financeTaxRevisionIndexesReady(rows))return;
  const clauses:string[]=[];
  for(const {legacy,replacement,column} of revisions){
   const old=rows.some(row=>row.name===legacy),next=rows.some(row=>row.name===replacement);
   if((old&&!exact(rows,legacy,column,true))||(next&&!exact(rows,replacement,column,false))||
      rows.some(row=>row.c===column&&Number(row.non_unique)===0&&row.name!==legacy))throw Error('unexpected_index');
   // A missing table or unrelated index loss is not permission to reconstruct it.
   if(!old&&!next)throw Error('missing_revision_index');
   if(!next)clauses.push(`ADD INDEX ${replacement} (${column})`);
   if(old)clauses.push(`DROP INDEX ${legacy}`);
  }
  try{await db.$executeRawUnsafe(`ALTER TABLE finance_tax_policies ${clauses.join(', ')}`);}
  catch{if(!financeTaxRevisionIndexesReady(await read()))throw Error('upgrade_failed');}
  if(!financeTaxRevisionIndexesReady(await read()))throw Error('upgrade_incomplete');
 }catch{throw Error('finance_tax_index_upgrade_failed');}
}

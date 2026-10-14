/** Non-financial batch preparation. Durable reservation happens before this:
 * uncertain lines stay attached to their batch and are never silently retried. */
export async function prepareSettlementPaymentLinks(lines:readonly {id:string;status:string}[],prepareCard:(id:string)=>Promise<void>):Promise<{failedIds:string[]}>{
 const failedIds:string[]=[];
 for(const line of lines){
  if(line.status==='paid')continue;
  try{await prepareCard(line.id);}catch{failedIds.push(line.id);}
 }
 return {failedIds};
}

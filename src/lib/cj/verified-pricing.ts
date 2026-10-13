import 'server-only';
import {prisma} from '@/lib/prisma';

/** Do not turn a database failure or absent FX setting into a confirmed SAR quote. */
export async function readVerifiedCjPricing(){
  const rows=await prisma.site_settings.findMany({where:{k:{in:['cj_usd_to_sar_x100','commerce_default_margin_bps']}},select:{k:true,v:true}});
  const values=new Map(rows.map(row=>[row.k,row.v]));
  const integer=(key:string,min:number,max:number)=>{
    const raw=values.get(key);if(typeof raw!=='string'||!/^\d+$/.test(raw.trim()))throw Error('cj_pricing_unverified');
    const value=Number(raw);if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('cj_pricing_unverified');return value;
  };
  return {usdToSarX100:integer('cj_usd_to_sar_x100',1,100000),marginBps:integer('commerce_default_margin_bps',0,100000)};
}

import 'server-only';
import {getStorefrontCjProduct} from './mapping';
import {cjImg,cjProductImages} from './storefront';
import {checkedMoney,lineTotal} from '@/lib/commerce/money';
import {validateTrialCart,trialCartTotal,type TrialCartQuote} from './trial-cart';

function safeImage(value:unknown):string|null{
  if(typeof value!=='string'||value.length>2048)return null;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?cjImg(url.href):null;}catch{return null;}
}
/** Saved CJ parent products only. No supplier requests, writes, orders, or payment quote. */
export async function quoteCjTrialCart(value:unknown):Promise<TrialCartQuote>{
  const items=validateTrialCart(value);
  const result:TrialCartQuote={currency:'SAR',lines:[],totalMinor:0,rejected:[]};
  for(const item of items){
    // Staff can preview drafts; the saved-row reader always excludes hidden rows.
    const row=await getStorefrontCjProduct(item.id,false);
    if(!row||Number(row.id)!==item.id||row.hidden!==0){result.rejected.push({id:item.id,reason:'unavailable'});continue;}
    const unitMinor=row.sale_price_override_minor??row.sale_price_minor;
    let totalMinor:number;
    try{if(row.currency!=='SAR'||checkedMoney(unitMinor)===0)throw Error('invalid_money');totalMinor=lineTotal(unitMinor,item.qty);}catch{result.rejected.push({id:item.id,reason:'invalid_price'});continue;}
    result.lines.push({...item,title:(row.name_ar||'منتج بانتظار ترجمة الاسم').slice(0,400),image:safeImage(cjProductImages(row)[0]),unitMinor,currency:'SAR',totalMinor});
  }
  try{result.totalMinor=trialCartTotal(result.lines);}catch{throw Error('invalid_total');}
  return result;
}

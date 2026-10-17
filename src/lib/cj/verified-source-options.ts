import 'server-only';
import {getProduct} from './client';
import {cjSourceOptions,sameCjSourceOptions,type CjSourceOptions} from './source-option-identity';
import type {CjVariant} from './types';
/** /variant/query omits productKeyEn. Corroborate its values with a fresh product read;
 * only that product's explicit API schema may supply the missing dimension names. */
export async function verifyCjSourceOptions(pid:string,selected:CjVariant,live:CjVariant,readProduct:typeof getProduct=getProduct):Promise<CjSourceOptions|null>{
 if(selected.vid!==live.vid||!selected.variantSku||selected.variantSku!==live.variantSku)return null;
 let candidate=live;
 if(selected.optionSchema?.length&&!live.optionSchema?.length){
  const response=await readProduct(pid).catch(()=>null);
  if(!response?.ok||response.data.pid!==pid||!response.data.optionSchema?.length)return null;
  const rows=response.data.variants.filter(v=>v.vid===live.vid);
  if(rows.length!==1||rows[0].variantSku!==live.variantSku)return null;
  const schema=response.data.optionSchema;
  const productOptions=cjSourceOptions({...rows[0],optionSchema:schema});
  candidate={...live,optionSchema:schema};
  if(!sameCjSourceOptions(productOptions,cjSourceOptions(candidate)))return null;
 }
 const options=cjSourceOptions(candidate);
 return sameCjSourceOptions(cjSourceOptions(selected),options)?options:null;
}

import {CATEGORY_KINDS,categoryPolicy,type CategoryKind} from './contracts';
import {CategoryValidationError,validateDefinition} from './validation';
import {defaultListingPolicy,validateListingPolicy} from './listing-policy';
import {CATEGORY_SEED_TEMPLATES} from './seed-templates';
export function nextCategoryFieldKey(fields:readonly {key:string}[]):string {
  const used=new Set(fields.map(f=>f.key));
  let n=1;
  while(used.has(`field_${n}`)) n++;
  return `field_${n}`;
}
export function parseSubcategoryDefinition(fd:FormData) {
  const kind=String(fd.get('kind')||'other') as CategoryKind;
  if(!CATEGORY_KINDS.includes(kind)) throw new CategoryValidationError('','نوع القسم غير صالح');
  const text=String(fd.get('fields_json')||'[]');
  if(text.length>100000) throw new CategoryValidationError('','التعريف كبير جداً');
  let raw:unknown;try{raw=JSON.parse(text);}catch{throw new CategoryValidationError('','تعريف غير صالح');}
  const policyText=String(fd.get('listing_policy_json')||'').trim();
  let listingPolicy=defaultListingPolicy(kind);
  if(policyText){
    if(policyText.length>30000)throw new CategoryValidationError('','سياسة أنواع الإعلان كبيرة جداً');
    let policyRaw:unknown;try{policyRaw=JSON.parse(policyText);}catch{throw new CategoryValidationError('','سياسة أنواع الإعلان غير صالحة');}
    listingPolicy=validateListingPolicy(policyRaw);
  }
  const rawTemplateKey=String(fd.get('template_key')||'').trim();
  const templateKey=rawTemplateKey&&CATEGORY_SEED_TEMPLATES.some(item=>item.key===rawTemplateKey)?rawTemplateKey:undefined;
  if(rawTemplateKey&&!templateKey)throw new CategoryValidationError('','قالب القسم غير صالح');
  return {kind,...categoryPolicy({kind,priceEnabled:fd.get('price_enabled')==='1',goodsEnabled:fd.get('goods_enabled')==='1'}),fields:validateDefinition(raw),listingPolicy,templateKey};
}

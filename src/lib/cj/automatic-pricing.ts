import 'server-only';
/** Customer unit price uses the configured markup on source cost, before freight.
 * Never add markup to an already calculated customer selling price or freight.
 */
export function automaticCjPricing(settings:{marginBps:number},product:{other_costs_minor:number}){
 if(!Number.isSafeInteger(settings.marginBps)||settings.marginBps<0||settings.marginBps>100000)throw Error('cj_pricing_unverified');
 return {marginBps:settings.marginBps,otherCostsMinor:product.other_costs_minor,saleOverrideMinor:null};
}

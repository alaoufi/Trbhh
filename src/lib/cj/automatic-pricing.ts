import 'server-only';
/** Customer unit price uses the configured markup on source cost, before freight.
 * Never add markup to an already calculated customer selling price or freight.
 */
export function automaticCjPricing(settings:{marginBps:number},product:{other_costs_minor:number}){
 if(!Number.isSafeInteger(settings.marginBps)||settings.marginBps<0||settings.marginBps>100000)throw Error('cj_pricing_unverified');
 return {marginBps:settings.marginBps,otherCostsMinor:product.other_costs_minor,saleOverrideMinor:null};
}

export function automaticCjUnitPrice(sourceUsd:number,settings:{marginBps:number;usdToSarX100:number},otherCostsMinor=0):number{
 const policy=automaticCjPricing(settings,{other_costs_minor:otherCostsMinor});
 if(!Number.isFinite(sourceUsd)||sourceUsd<=0||!Number.isSafeInteger(settings.usdToSarX100)||settings.usdToSarX100<=0||!Number.isSafeInteger(otherCostsMinor)||otherCostsMinor<0)throw Error('cj_pricing_unverified');
 const cost=Math.round(sourceUsd*settings.usdToSarX100);
 if(!Number.isSafeInteger(cost)||cost<1)throw Error('cj_pricing_unverified');
 const base=cost+otherCostsMinor;
 if(!Number.isSafeInteger(base))throw Error('cj_pricing_unverified');
 const price=base+Math.ceil(base*policy.marginBps/10000);
 if(!Number.isSafeInteger(price)||price<1)throw Error('cj_pricing_unverified');
 return price;
}

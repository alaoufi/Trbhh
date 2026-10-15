/** Customer presentation only. Original provider evidence stays intact for administration. */
const supplierIdentity=/cj|سي\s*جي|المورد/i;
export function customerFulfillmentText(value:string,fallback:string):string {
 return !value.trim()||supplierIdentity.test(value)?fallback:value;
}
export function customerShipment<T extends {carrier?:string;trackingUrl?:string|null}>(shipment:T):T {
 let trackingUrl=shipment.trackingUrl||null;
 if(trackingUrl){try{const url=new URL(trackingUrl);if(url.protocol!=='https:'||url.username||url.password||supplierIdentity.test(decodeURIComponent(url.href)))trackingUrl=null;}catch{trackingUrl=null;}}
 return {...shipment,carrier:shipment.carrier&&supplierIdentity.test(shipment.carrier)?'خدمة التوصيل':shipment.carrier,trackingUrl};
}

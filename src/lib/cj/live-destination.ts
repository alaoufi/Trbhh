import 'server-only';
export function assertSaudiCjCheckoutAddress(address:Record<string,unknown>):void{
 const text=(k:string)=>typeof address[k]==='string'?(address[k] as string).trim():'';
 if(text('country')!=='SA'||!/^\+?9665\d{8}$/.test(text('phone'))||!text('street')||!text('buildingNumber')||!/^[A-Za-z]{4}\d{4}$/.test(text('shortAddress')))throw Error('cj_saudi_national_address_required');
}
/** Recheck persisted destinations before supplier creation or cashier preparation.
 * Historical paid quotes are not silently edited to invent missing address data. */
export function assertSaudiCjSupplierAddress(destination:Record<string,string>):void{
 assertSaudiCjCheckoutAddress({country:destination.country,phone:destination.phone,street:destination.address1,buildingNumber:destination.houseNumber,shortAddress:destination.shortAddress});
 if(!destination.address1.includes(destination.shortAddress))throw Error('cj_saudi_national_address_required');
}
/** One exact supplier-address contract shared by quote, bank gate and CJ request.
 * Preserve additional address content; never silently truncate a paid destination. */
export function canonicalCjDestination(input:Record<string,unknown>,options:{alreadyCanonical?:boolean}={}){
 const text=(key:string)=>typeof input[key]==='string'?input[key] as string:'';
 const country=text('country'),name=text('name')||text('fullName'),phone=text('phone'),region=text('region'),city=text('city'),postalCode=text('postalCode'),address2=text('address2');
 if([name,region,city].some(value=>value.length>50)||phone.length>20)throw new Error('cj_destination_field_too_long');
 const base=text('address1')||text('addressLine')||['district','street','buildingNumber','secondaryNumber','shortAddress','deliveryNotes'].map(text).filter(Boolean).join('، ');
 if(country!=='SA'||!/^[0-9]{5}$/.test(postalCode)||![name,phone,region,city,base].every(value=>value.trim())||[name,phone,region,city,base,address2].some(value=>/[\u0000-\u001f\u007f]/.test(value)))throw new Error('cj_quote_destination_invalid');
 const suffix=(address2?`، العنوان الإضافي: ${address2}`:'')+`، الرمز البريدي ${postalCode}`;
 if(options.alreadyCanonical&&!base.endsWith(suffix))throw new Error('cj_quote_destination_invalid');
 const address1=options.alreadyCanonical?base:base+suffix;
 if(address1.length>500)throw new Error('cj_destination_too_long');
 const extra:Record<string,string>={};
 const houseNumber=text('buildingNumber')||text('houseNumber'),shortAddress=text('shortAddress');
 if(houseNumber&&(houseNumber.length>20||/[\u0000-\u001f\u007f]/.test(houseNumber))||shortAddress&&!/^[A-Z]{4}\d{4}$/.test(shortAddress))throw Error('cj_saudi_national_address_required');
 if(houseNumber)extra.houseNumber=houseNumber;
 if(shortAddress)extra.shortAddress=shortAddress;
 return {country,name,phone,region,city,address1,address2,postalCode,...extra};
}

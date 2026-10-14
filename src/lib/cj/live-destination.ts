import 'server-only';
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
 return {country,name,phone,region,city,address1,address2,postalCode};
}

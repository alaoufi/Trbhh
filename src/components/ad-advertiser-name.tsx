/** Public publishing identity only; never exposes contact or login information. */
export function AdAdvertiserName({name,storeName}:{name?:string|null;storeName?:string|null}){
 const display=storeName?.trim()||name?.trim()||'المعلن';
 return <span data-advertiser-name className="block min-w-0 break-words text-sm font-bold leading-5 text-primary">المعلن: {display}</span>;
}

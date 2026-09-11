'use client';
export function notify(message:string){window.dispatchEvent(new CustomEvent('trbhh-notice',{detail:message}));}
export function readLocal<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem('trbhh-v2-'+key)||'null')??fallback;}catch{return fallback;}}
export function writeLocal(key:string,value:unknown){try{localStorage.setItem('trbhh-v2-'+key,JSON.stringify(value));}catch{notify('تعذر الحفظ على هذا المتصفح. يمكنك إكمال التجربة دون حفظ دائم.');}}

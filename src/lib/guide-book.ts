export type GuideChapter={id:string;title:string;goal:string;steps:string[];links?:{href:string;label:string}[];images?:{src:string;alt:string}[]};
export const GUIDE_BOOK_SETTING='guide_book_enabled';
function normalize(value:string){return value.toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\s+/g,' ').trim();}
export function searchGuide(sections:GuideChapter[],query:string):number[]{
 const words=normalize(query.slice(0,120)).split(' ').filter(Boolean);
 return sections.flatMap((s,i)=>{const text=normalize([s.title,s.goal,...s.steps,...(s.links||[]).map(l=>l.label)].join(' '));return words.every(w=>text.includes(w))?[i]:[];});
}
export function guideHashIndex(sections:GuideChapter[],hash:string):number{
 try{const id=decodeURIComponent(hash.replace(/^#/,''));return sections.findIndex(s=>s.id===id);}catch{return -1;}
}
export function guideGroup(s:GuideChapter):string{
 const value=`${s.id} ${s.title}`;
 if(/categor|field|الأقسام|الحقول/.test(value))return 'الأقسام والحقول';
 if(/wallet|topup|revenue|package|subscription|المحفظة|الرصيد|اشتراك|باقات/.test(value))return 'الرصيد والباقات';
 if(/report|message|words|guard|بلاغ|مراسل|محادث/.test(value))return 'التواصل والحماية';
 if(/store|supplier|commerce|متجر|متاجر|مورد|سلع/.test(value))return 'المتاجر والأعمال';
 if(/user|account|register|login|verif|identity|name-request|حساب|دخول|عضو|أعضاء|هوية|هويات|توثيق/.test(value))return 'الحساب والصلاحيات';
 if(/ad|home|search|classified|promo|إعلان|إعلانات|البحث|تصفح/.test(value))return 'الإعلانات والتصفح';
 return 'الإعدادات والمساعدة';
}

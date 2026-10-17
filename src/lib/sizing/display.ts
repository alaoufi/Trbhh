/** Display-only policy: never infer a conversion, gender, or change stored options. */
export function isSizeField(key:string,label=''):boolean{
 return /^(?:size|shoe_size|clothing_size|footwear_size|المقاس|مقاس|尺码)$/i.test(key.trim())||/^(?:المقاس|مقاس الحذاء|مقاس الملابس)$/i.test(label.trim());
}
export function familiarSizeLabel(value:string):string{
 const raw=value.trim();
 const alpha:Record<string,string>={XXS:'صغير جدًا جدًا',XS:'صغير جدًا',S:'صغير',M:'متوسط',L:'كبير',XL:'كبير جدًا',XXL:'كبير جدًا جدًا',XXXL:'كبير جدًا جدًا جدًا'};
 if(Object.hasOwn(alpha,raw.toUpperCase()))return raw+' — '+alpha[raw.toUpperCase()];
 const m=raw.match(/^(US|EU|EUR|UK)(?:[ _-]+(women|womens|female|men|mens|male|kids|children))?[ :_-]*(\d+(?:[.,]\d+)?)$/i);
 if(!m)return value;
 const region=m[1].toUpperCase(),system=region==='US'?'أمريكي':region==='UK'?'بريطاني':'أوروبي';
 const audience=m[2]?/^(women|womens|female)$/i.test(m[2])?'نسائي':/^(men|mens|male)$/i.test(m[2])?'رجالي':'أطفال':null;
 return [system,audience].filter(Boolean).join(' ')+' ('+(region==='EUR'?'EU':region)+') '+m[3];
}

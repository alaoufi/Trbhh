export type CjSizeChart={pid:string;configured:boolean;baseVariantKey:string|null;rows:{baseValue:string;areas:{country:string;value:string}[]}[]};
const text=(v:unknown,max=160):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export function parseCjSizeChart(raw:unknown,pid:string):CjSizeChart|null{
 if(!raw||typeof raw!=='object')return null;const d=raw as Record<string,unknown>;
 if(d.pid!==pid||typeof d.configured!=='boolean')return null;
 if(!d.configured)return {pid,configured:false,baseVariantKey:null,rows:[]};
 if(!text(d.baseVariantKey,80)||!Array.isArray(d.countries)||d.countries.length>30||!d.countries.every(v=>text(v,80))||new Set(d.countries).size!==d.countries.length||!Array.isArray(d.chartData)||!d.chartData.length||d.chartData.length>200)return null;
 const rows:CjSizeChart['rows']=[];
 for(const value of d.chartData){
  if(!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;
  if(!text(row.baseValue)||!Array.isArray(row.areaValues)||row.areaValues.length>30)return null;
  const areas:{country:string;value:string}[]=[];
  for(const item of row.areaValues){if(!item||typeof item!=='object'||!text(item.country,80)||typeof item.value!=='string'||item.value.length>160||!d.countries.includes(item.country))return null;areas.push({country:item.country,value:item.value});}
  if(new Set(areas.map(a=>a.country)).size!==areas.length)return null;
  rows.push({baseValue:row.baseValue,areas});
 }
 if(new Set(rows.map(r=>r.baseValue)).size!==rows.length)return null;
 return {pid,configured:true,baseVariantKey:d.baseVariantKey,rows};
}
export function cjSizeCountryLabel(country:string){
 const key=country.toLowerCase().replace(/[()_-]+/g,' ').replace(/\s+/g,' ').trim();
 const labels=({eu:'أوروبي (EU)',us:'أمريكي (US)',uk:'بريطاني (UK)','us women':'نسائي أمريكي (US)','us female':'نسائي أمريكي (US)','us men':'رجالي أمريكي (US)','us male':'رجالي أمريكي (US)'} as Record<string,string>);
 return Object.hasOwn(labels,key)?labels[key]:country;
}

const normalized=(v:string)=>v.trim().replace(/\s+/g,' ').toLowerCase();
function regionalSize(value:string):{country:string;value:string}|null{
 const m=value.trim().match(/^(US(?:[ _-]+(?:women|female|men|male))?|EU|EUR|UK)[ :_-]*(\d+(?:[.,]\d+)?)$/i);
 if(!m)return null;
 return {country:m[1].toLowerCase().replace(/[ _-]+/g,' ').replace('eur','eu').replace('female','women').replace('male','men'),value:m[2].replace(',','.')};
}
function areaMatches(source:string,country:string,value:string):boolean{
 const s=regionalSize(source);if(!s)return false;
 const c=normalized(country).replace(/[()_-]+/g,' ').replace(/\s+/g,' ').replace('european','eu').replace('eur','eu').replace('female','women').replace('male','men');
 const v=regionalSize(value);
 return s.country===c&&s.value===(v?v.value:value.trim().replace(',','.'));
}
export function cjSizeOptionLabel(sourceValue:string,chart:CjSizeChart|null|undefined):string{
 if(!chart?.configured||!/^(size|المقاس)$/i.test(chart.baseVariantKey??''))return sourceValue;
 const exact=chart.rows.filter(row=>normalized(row.baseValue)===normalized(sourceValue));
 const matching=exact.length?exact:chart.rows.filter(row=>row.areas.some(a=>areaMatches(sourceValue,a.country,a.value)));
 if(matching.length!==1)return sourceValue;
 const areas=matching[0].areas.filter(a=>a.value.trim());
 const rank=(country:string)=>/^(eu|eur|european)$/i.test(country.trim())?0:/^us/i.test(country)?1:/^uk/i.test(country)?2:3;
 const extra=[...areas].sort((a,b)=>rank(a.country)-rank(b.country)).map(a=>cjSizeCountryLabel(a.country)+': '+a.value);
 return [...extra,'الأصلي: '+sourceValue].join(' · ');
}

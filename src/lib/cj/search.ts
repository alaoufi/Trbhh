import 'server-only';
import {prisma} from '@/lib/prisma';
import {normalizeArabicForSearch,translateArabicToEnglish} from '@/lib/cj/translate';
import {localSearchQueries} from '@/lib/ai/local';

/** Exact glossary fallback never drops qualifiers from a longer phrase. */
async function glossaryReverse(query:string):Promise<string|null> {
 const needle=normalizeArabicForSearch(query).replace(/^ال/,'');
 const rows=await prisma.cj_glossary.findMany({where:{enabled:1,source:{not:''}},select:{source:true,target_ar:true},take:2000}).catch(()=>[]);
 const match=rows.find(row=>normalizeArabicForSearch(row.target_ar).replace(/^ال/,'')===needle);
 const source=match?.source.trim();
 return source&&source.length<=100&&/[a-z]/i.test(source)&&! /\p{Script=Arabic}/u.test(source)?source:null;
}

/** Local intent understanding, then local translation/glossary on model unavailability. */
export async function cjSearchQueries(query:string):Promise<string[]> {
 const source=query.trim().slice(0,100);if(!source)return [];
 if(/^[A-Za-z0-9_-]+$/.test(source)&&/\d/.test(source))return [source];
 const semantic=await localSearchQueries(source);
 if(semantic.length)return semantic;
 if(!/\p{Script=Arabic}/u.test(source))return [source];
 const glossary=await glossaryReverse(source);if(glossary)return [glossary];
 const translated=await translateArabicToEnglish(source).catch(()=>null);
 return translated?[translated]:[];
}

/** Compatibility for existing read-only consumers. */
export async function translateArabicCjSearch(query:string):Promise<string|null> {
 if(!query.trim())return '';
 return (await cjSearchQueries(query))[0]??null;
}

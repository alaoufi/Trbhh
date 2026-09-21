import 'server-only';
import {isIP} from 'node:net';
import {Workbook,type CellValue} from 'exceljs';
import {ONBOARDING_FIELDS,type OnboardingValues,type OnboardingValidation,type OnboardingReport} from './onboarding-fields';
import {MAX_ONBOARDING_BYTES} from './onboarding-limits';
export {MAX_ONBOARDING_BYTES} from './onboarding-limits';
const digits=(s:string)=>s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const label=(s:string)=>s.normalize('NFKC').trim().replace(/[أإآ]/g,'ا').replace(/[\u064b-\u065fـ]/g,'').replace(/[\s:：*]+/g,' ').trim().toLowerCase();
const aliases=new Map<string,string>(ONBOARDING_FIELDS.flatMap(([key,name])=>[[label(key),key],[label(name),key]]));
for(const [name,key] of [
 ['رقم السجل التجاري','registration_number'],['البريد الإلكتروني','email'],['رقم الجوال','phone'],['رابط المتجر','store_url'],
 ['اسم المنشأة حسب السجل التجاري','establishment_name'],['اسم متجر سلة الرسمي','store_name'],['تاريخ انتهاء السجل التجاري','registration_expiry'],
 ['العنوان الوطني / عنوان المنشأة','address'],['اسم صاحب المتجر أو المفوض بالكامل','contact_name'],['صفته','contact_role'],
 ['رقم الهوية أو الإقامة للمفوض','identity_number'],['البريد الإلكتروني الرسمي','email'],['مدة تجهيز الطلب قبل الشحن','preparation_time'],
 ['متوسط مدة التوصيل داخل السعودية','delivery_time'],['شركات الشحن المستخدمة','shipping_companies'],['هل يتم الشحن لجميع مناطق السعودية؟','coverage'],
 ['المناطق غير المشمولة بالشحن','excluded_regions'],['هل مخزون سلة هو المخزون الفعلي المتاح للبيع؟','stock_actual'],
 ['هل يتم تحديث المخزون في سلة بشكل منتظم؟','stock_updated'],['مدة السماح بالاسترجاع','returns_period'],
 ['معالجة المنتج التالف أو غير المطابق','damage_policy'],['من يتحمل شحن المرتجع عند وجود عيب؟','return_shipping'],
 ['دورية التسوية المالية','settlement_terms'],['رقم الآيبان IBAN','iban'],['اسم صاحب الحساب البنكي','account_holder'],
 ['اسم المفوض بالموافقة على الربط','authorized_name'],['هل تقر بصحة جميع البيانات؟','agreements'],
])aliases.set(label(name),key);
const productColumns=new Set(['اسم المنتج','اسم السلعة','product name','product','sku','رمز المنتج','السعر','price','الكمية','quantity','المخزون','stock','الصورة','image'].map(label));
const secretLabel=/(password|secret|token|otp|كلمة.*مرور|رمز.*تحقق|بيانات.*دخول)/i;
export function normalizeStoreUrl(raw:string):string {
 const u=new URL(raw.trim());
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw Error('onboarding_store_url');
 const host=u.hostname.toLowerCase(),path=u.pathname.replace(/\/+$/,'');
 if(host==='salla.sa') {if(!/^\/[a-zA-Z0-9_-]{2,100}$/.test(path))throw Error('onboarding_store_url');return `https://${host}${path.toLowerCase()}`;}
 if(path)throw Error('onboarding_store_url');
 const parts=host.split('.');
 if(host.length>253||isIP(host)!==0||parts.length<2||parts.some(part=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))||!/(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(parts.at(-1)!))throw Error('onboarding_store_url');
 return `https://${host}`;
}
function validIban(value:string) {if(!/^SA\d{22}$/.test(value))return false;const n=value.slice(4)+'2810'+value.slice(2,4);let r=0;for(const c of n)r=(r*10+Number(c))%97;return r===1;}
const isRealDate=(iso:string)=>Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso;
function coerceDate(v:string):string|null {
 const s=digits(v).trim().replace(/\s+/g,'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return isRealDate(s)?s:null;
 let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // dd/mm/yyyy
 if(m){const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return isRealDate(iso)?iso:null;}
 m=s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/); // yyyy/mm/dd
 if(m){const iso=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return isRealDate(iso)?iso:null;}
 return null;
}
function coercePhone(v:string):string|null {
 let s=digits(v).replace(/[\s\-()]/g,'');
 if(s.startsWith('00966'))s='+966'+s.slice(5);
 if(/^9665\d{8}$/.test(s))s='+'+s;
 if(/^0?5\d{8}$/.test(s))s='+966'+s.replace(/^0/,'');
 return /^\+9665\d{8}$/.test(s)?s:null;
}
/** يطبّع/يتحقّق قيمة حقل. ok=false ⇒ لا يمكن قبولها (غير صالحة). */
function coerceField(key:string,value:string):{ok:true;value:string}|{ok:false} {
 if(['registration_number','tax_number','identity_number','iban'].includes(key))value=digits(value).replace(/[\s-]/g,'');
 if(key==='registration_number')return /^\d{10}$/.test(value)?{ok:true,value}:{ok:false};
 if(key==='identity_number')return /^[12]\d{9}$/.test(value)?{ok:true,value}:{ok:false};
 if(key==='tax_number')return /^3\d{13}3$/.test(value)?{ok:true,value}:{ok:false};
 if(key==='phone'){const p=coercePhone(value);return p?{ok:true,value:p}:{ok:false};}
 if(key==='email'){const e=value.trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?{ok:true,value:e}:{ok:false};}
 if(key==='iban'){const i=value.toUpperCase();return validIban(i)?{ok:true,value:i}:{ok:false};}
 if(key==='store_url'){try{return {ok:true,value:normalizeStoreUrl(value)};}catch{return {ok:false};}}
 if(['registration_expiry','submitted_date'].includes(key)){const d=coerceDate(value);return d?{ok:true,value:d}:{ok:false};}
 if(['stock_actual','stock_updated'].includes(key)){const low=digits(value).trim().toLowerCase();if(['نعم','yes','true','1','y'].includes(low))return {ok:true,value:'نعم'};if(['لا','no','false','0','n'].includes(low))return {ok:true,value:'لا'};return {ok:false};}
 return {ok:true,value};
}
const clip=(s:string)=>s.length>60?s.slice(0,57)+'…':s;

/**
 * تحقّق متسامح: يقبل أكبر قدر من البيانات. الحقول الاختيارية الفارغة تُحفظ null بلا
 * خطأ، والقيم القابلة للتصحيح (جوال/تاريخ/بريد/IBAN…) تُصحَّح تلقائياً، والاختيارية
 * غير القابلة للتصحيح تُتجاوز مع ملاحظة (بلا رفض)، ولا يُرفض الصف إلا إذا نقص حقلٌ
 * أساسيّ فعلاً أو تعذّر تصحيح حقلٍ أساسيّ. يعيد تقريراً بأربع فئات.
 */
export function validateOnboarding(raw:Record<string,unknown>,options:{preserveMissingRequired?:boolean}={}):OnboardingValidation {
 const values:OnboardingValues={};
 const report:OnboardingReport={imported:[],corrected:[],skipped:[],needsReview:[]};
 const known=new Set(ONBOARDING_FIELDS.map(([k])=>String(k)));
 for(const key of Object.keys(raw)){
  if(known.has(key))continue;
  if(secretLabel.test(key))report.needsReview.push('الملف يحتوي حقل بيانات دخول غير مسموح.');
  else report.skipped.push({field:key,label:key,note:'حقل غير معروف — تم تجاوزه.'});
 }
 for(const [key,name,required] of ONBOARDING_FIELDS){
  const input=raw[key];
  const rawStr=input===null||input===undefined?'':typeof input==='string'?input:String(input);
  const value=rawStr.trim();
  // فارغ → للمطلوب: نقص أساسي؛ للاختياري الفارغ: يُترك دون قيمة (يُحفظ الأصل عند
  // التحديث، ويُخزَّن فارغاً للمورد الجديد). «لا يوجد» = مسح صريح للاختياري.
  if(value===''||value==='لا يوجد'){
   if(required&&!options.preserveMissingRequired)report.needsReview.push(`${name}: مطلوب.`);
   else if(required&&['registration_number','store_url'].includes(key))report.needsReview.push(`${name}: مطلوب.`);
   else if(value==='لا يوجد')values[key]=null;
   continue;
  }
  const max=key==='store_url'?300:key==='email'?254:key==='address'?500:['notes','returns_policy','damage_policy','settlement_terms','agreements'].includes(key)?2000:200;
  if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)){
   if(required)report.needsReview.push(`${name}: قيمة طويلة أو غير صالحة.`);
   else report.skipped.push({field:key,label:name,note:`قيمة طويلة/غير صالحة — تم تجاوزها (حفظ القيمة السابقة). الأصل: ${clip(value)}`});
   continue; // اختياري: يُتجاوز دون قيمة للحفاظ على البيانات السابقة
  }
  const res=coerceField(key,value);
  if(res.ok){
   values[key]=res.value;
   if(res.value!==value)report.corrected.push({field:key,label:name,note:`تم تصحيحه تلقائياً: «${clip(value)}» ← «${clip(res.value)}»`});
   else report.imported.push(key);
  } else if(required){
   report.needsReview.push(`${name}: صيغة غير صالحة${['registration_expiry','submitted_date'].includes(key)?'؛ استخدم YYYY-MM-DD':''}.`);
  } else {
   // اختياري غير قابل للتصحيح: يُتجاوز دون قيمة (يُحفظ الأصل، ولا يُستبدل ببيانات غير صالحة)
   report.skipped.push({field:key,label:name,note:`صيغة غير صالحة — تم تجاوزها (حفظ القيمة السابقة). الأصل: ${clip(value)}`});
  }
 }
 const warnings:string[]=[];
 if(values.stock_actual==='لا'||values.stock_updated==='لا')warnings.push('المورد لم يؤكد جاهزية المخزون؛ راجع ذلك قبل اعتماد أي منتج.');
 return {values,errors:[...new Set(report.needsReview)],warnings,report};
}
export function mergeOnboarding(old:OnboardingValues,incoming:OnboardingValues):OnboardingValues {
 return {...old,...Object.fromEntries(Object.entries(incoming).filter(([,v])=>v!==''&&v!==undefined))};
}
/** Bound ZIP expansion before ExcelJS decompresses. Active content is detected but never executed. */
function validateZip(buffer:Buffer):{macros:boolean;externalLinks:boolean}{
 if(buffer.length>MAX_ONBOARDING_BYTES)throw Error('onboarding_size');
 if(buffer.length<22||buffer.readUInt32LE(0)!==0x04034b50)throw Error('onboarding_not_excel');
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('onboarding_not_excel');
 const count=buffer.readUInt16LE(end+10);let pos=buffer.readUInt32LE(end+16),size=0,macros=false,externalLinks=false;
 if(count>512||count===0||count===0xffff||pos===0xffffffff||pos>=end)throw Error('onboarding_archive');
 for(let i=0;i<count;i++){
  if(pos+46>end||buffer.readUInt32LE(pos)!==0x02014b50)throw Error('onboarding_archive');
  const expanded=buffer.readUInt32LE(pos+24),nameSize=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32);
  if(pos+46+nameSize+extra+comment>end)throw Error('onboarding_archive');
  if(buffer.readUInt16LE(pos+8)&1)throw Error('onboarding_encrypted');
  const name=buffer.subarray(pos+46,pos+46+nameSize).toString('utf8');size+=expanded;
  if(expanded>24*1024*1024||size>64*1024*1024||name.includes('../')||name.startsWith('/'))throw Error('onboarding_archive');
  if(/vbaProject|macrosheets|\.bin$/i.test(name))macros=true;
  if(/externalLinks/i.test(name))externalLinks=true;
  pos+=46+nameSize+extra+comment;
 }
 return {macros,externalLinks};
}
function cell(value:CellValue):string {
 if(value===null||value===undefined)return '';
 if(typeof value==='string')return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('onboarding_cell');return String(value);}
 if(typeof value==='boolean')return value?'نعم':'لا';
 if(value instanceof Date)return value.toISOString().slice(0,10);
 if('formula' in value||'sharedFormula' in value)throw Error('onboarding_formula');
 if('richText' in value)return value.richText.map(v=>v.text).join('');
 if('hyperlink' in value)return value.hyperlink;
 throw Error('onboarding_cell');
}
export async function parseOnboardingWorkbook(bytes:Buffer,_filename:string):Promise<OnboardingValidation>{
 const archive=validateZip(bytes);
 const workbook=new Workbook();try {await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);}catch{throw Error('onboarding_not_excel');}
 const sheets=workbook.worksheets.filter(s=>s.actualRowCount>0);if(!sheets.length)throw Error('onboarding_sheet');
 const candidates:{raw:Record<string,unknown>;score:number}[]=[];let productExport=false;
 for(const sheet of sheets){
  if(sheet.rowCount>5000||sheet.columnCount>200)continue;
  const rows:string[][]=[];sheet.eachRow(row=>{const values:string[]=[];row.eachCell({includeEmpty:true},(c,n)=>{values[n-1]=cell(c.value);});rows.push(values);});
  const raw:Record<string,unknown>={};let score=0,hasSecret=false;
  if(rows.some(row=>row.filter(value=>productColumns.has(label(value||''))).length>=3))productExport=true;
  const put=(name:string,value:string)=>{if(secretLabel.test(name)){hasSecret=true;return;}const key=aliases.get(label(name));if(!key)return;if(Object.hasOwn(raw,key))throw Error('onboarding_duplicate_field');raw[key]=value??'';score++;};
  const header=rows.findIndex(r=>r.filter(v=>aliases.has(label(v||''))).length>=3);
  if(header>=0){const records=rows.slice(header+1).filter(r=>r.some(v=>v?.trim()));if(records.length>1)throw Error('onboarding_single_store');if(records[0])rows[header].forEach((name,i)=>put(name,records[0][i]||''));}
  else for(const row of rows)for(let i=0;i<row.length-1;i++)if(aliases.has(label(row[i]||'')))put(row[i]||'',row[i+1]||'');
  if(score>=3){if(hasSecret)throw Error('onboarding_secret');candidates.push({raw,score});}
 }
 if(!candidates.length)throw Error(productExport?'onboarding_product_export':'onboarding_sheet');
 candidates.sort((a,b)=>b.score-a.score);if(candidates.length>1&&candidates[0].score===candidates[1].score)throw Error('onboarding_sheet');
 const result=validateOnboarding(candidates[0].raw,{preserveMissingRequired:true});
 if(sheets.length>1)result.warnings.push('تم اعتماد ورقة بيانات المتجر وتجاوز الأوراق الإضافية مثل التعليمات.');
 if(archive.macros)result.warnings.push('تمت قراءة قيم الخلايا فقط وتجاهل وحدات الماكرو دون تشغيلها أو حفظها.');
 if(archive.externalLinks)result.warnings.push('تم تجاهل الروابط الخارجية في ملف Excel وقراءة القيم المحلية فقط.');
 return result;
}

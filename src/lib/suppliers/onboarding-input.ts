import 'server-only';
import {Workbook,type CellValue} from 'exceljs';
import {ONBOARDING_FIELDS,type OnboardingValues,type OnboardingValidation} from './onboarding-fields';
export const MAX_ONBOARDING_BYTES=2*1024*1024;
const digits=(s:string)=>s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const label=(s:string)=>s.normalize('NFKC').trim().replace(/[أإآ]/g,'ا').replace(/[\u064b-\u065fـ]/g,'').replace(/[\s:：*]+/g,' ').trim().toLowerCase();
const aliases=new Map<string,string>(ONBOARDING_FIELDS.flatMap(([key,name])=>[[label(key),key],[label(name),key]]));
for(const [name,key] of [['رقم السجل التجاري','registration_number'],['البريد الإلكتروني','email'],['رقم الجوال','phone'],['رابط المتجر','store_url']])aliases.set(label(name),key);
const secretLabel=/(password|secret|token|otp|كلمة.*مرور|رمز.*تحقق|بيانات.*دخول)/i;
export function normalizeStoreUrl(raw:string):string {
 const u=new URL(raw.trim());
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw Error('onboarding_store_url');
 const host=u.hostname.toLowerCase(),path=u.pathname.replace(/\/+$/,'');
 if(host==='salla.sa') {if(!/^\/[a-zA-Z0-9_-]{2,100}$/.test(path))throw Error('onboarding_store_url');return `https://${host}${path.toLowerCase()}`;}
 if(!/^[a-z0-9][a-z0-9-]{0,62}\.salla\.sa$/.test(host)||path)throw Error('onboarding_store_url');
 return `https://${host}`;
}
function validIban(value:string) {if(!/^SA\d{22}$/.test(value))return false;const n=value.slice(4)+'2810'+value.slice(2,4);let r=0;for(const c of n)r=(r*10+Number(c))%97;return r===1;}
export function validateOnboarding(raw:Record<string,unknown>):OnboardingValidation {
 const errors:string[]=[],warnings:string[]=[],values:OnboardingValues={};
 const known=new Set(ONBOARDING_FIELDS.map(([k])=>String(k)));
 for(const key of Object.keys(raw))if(!known.has(key))errors.push(secretLabel.test(key)?'الملف يحتوي حقل بيانات دخول غير مسموح.':'يوجد حقل غير معروف؛ استخدم النموذج المعتمد.');
 for(const [key,name,required] of ONBOARDING_FIELDS){
  const input=raw[key];if(input===undefined||input==='') {if(required)errors.push(`${name}: مطلوب.`);continue;}
  if(input===null){if(required)errors.push(`${name}: لا يمكن مسحه.`);else values[key]=null;continue;}
  if(typeof input!=='string'){errors.push(`${name}: يجب أن يكون نصًا.`);continue;}
  let value=input.trim();if(!value){if(required)errors.push(`${name}: مطلوب.`);continue;}
  if(value==='لا يوجد'){if(required)errors.push(`${name}: مطلوب.`);else values[key]=null;continue;}
  const max=key==='store_url'?300:key==='email'?254:key==='address'?500:['notes','returns_policy','damage_policy','settlement_terms','agreements'].includes(key)?2000:200;
  if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)){errors.push(`${name}: قيمة طويلة أو غير صالحة.`);continue;}
  try {
   if(['registration_number','tax_number','identity_number','phone','iban'].includes(key))value=digits(value).replace(/[\s-]/g,'');
   if(key==='registration_number'&&!/^\d{10}$/.test(value))throw Error();
   if(key==='identity_number'&&!/^[12]\d{9}$/.test(value))throw Error();
   if(key==='tax_number'&&!/^3\d{13}3$/.test(value))throw Error();
   if(key==='phone'){if(/^05\d{8}$/.test(value))value='+966'+value.slice(1);if(/^9665\d{8}$/.test(value))value='+'+value;if(!/^\+9665\d{8}$/.test(value))throw Error();}
   if(key==='email'){value=value.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error();}
   if(key==='iban'){value=value.toUpperCase();if(!validIban(value))throw Error();}
   if(key==='store_url')value=normalizeStoreUrl(value);
   if(['registration_expiry','submitted_date'].includes(key)){value=digits(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error();}
   if(['stock_actual','stock_updated'].includes(key)){if(!['نعم','لا','true','false','1','0'].includes(value))throw Error();value=['نعم','true','1'].includes(value)?'نعم':'لا';}
   values[key]=value;
  }catch{errors.push(`${name}: صيغة غير صالحة${['registration_expiry','submitted_date'].includes(key)?'؛ استخدم YYYY-MM-DD':''}.`);}
 }
 if(values.stock_actual==='لا'||values.stock_updated==='لا')warnings.push('المورد لم يؤكد جاهزية المخزون؛ راجع ذلك قبل اعتماد أي منتج.');
 return {values,errors:[...new Set(errors)],warnings};
}
export function mergeOnboarding(old:OnboardingValues,incoming:OnboardingValues):OnboardingValues {
 return {...old,...Object.fromEntries(Object.entries(incoming).filter(([,v])=>v!==''))};
}
/** Bound ZIP expansion before ExcelJS decompresses. Reject ZIP64, encryption and macros. */
function validateZip(buffer:Buffer){
 if(buffer.length>MAX_ONBOARDING_BYTES||buffer.length<22||buffer.readUInt32LE(0)!==0x04034b50)throw Error('onboarding_file');
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('onboarding_file');
 const count=buffer.readUInt16LE(end+10);let pos=buffer.readUInt32LE(end+16),size=0;
 if(count>128||count===0||pos>=end)throw Error('onboarding_file');
 for(let i=0;i<count;i++){
  if(pos+46>end||buffer.readUInt32LE(pos)!==0x02014b50)throw Error('onboarding_file');
  const expanded=buffer.readUInt32LE(pos+24),nameSize=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32);
  if(pos+46+nameSize+extra+comment>end||buffer.readUInt16LE(pos+8)&1)throw Error('onboarding_file');
  const name=buffer.subarray(pos+46,pos+46+nameSize).toString('utf8');size+=expanded;
  if(size>8*1024*1024||/vbaProject|externalLinks|\.bin$/i.test(name))throw Error('onboarding_file');
  pos+=46+nameSize+extra+comment;
 }
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
export async function parseOnboardingWorkbook(bytes:Buffer,filename:string):Promise<OnboardingValidation>{
 if(!/\.xlsx$/i.test(filename))throw Error('onboarding_file');validateZip(bytes);
 const workbook=new Workbook();try {await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);}catch{throw Error('onboarding_file');}
 const sheets=workbook.worksheets.filter(s=>s.actualRowCount>0);if(sheets.length!==1)throw Error('onboarding_sheet');
 const sheet=sheets[0];if(sheet.rowCount>100||sheet.columnCount>40)throw Error('onboarding_sheet');
 const rows:string[][]=[];sheet.eachRow(row=>{const values:string[]=[];row.eachCell({includeEmpty:true},(c,n)=>{values[n-1]=cell(c.value);});rows.push(values);});
 const raw:Record<string,unknown>={};
 const put=(name:string,value:string)=>{if(secretLabel.test(name))throw Error('onboarding_secret');const key=aliases.get(label(name));if(!key){if(name&&value&& !['الحقل','القيمة'].includes(name))throw Error('onboarding_header');return;}if(Object.hasOwn(raw,key))throw Error('onboarding_duplicate_field');raw[key]=value??'';};
 const header=rows.findIndex(r=>r.filter(v=>aliases.has(label(v||''))).length>=3);
 if(header>=0){const records=rows.slice(header+1).filter(r=>r.some(v=>v?.trim()));if(records.length!==1)throw Error('onboarding_single_store');rows[header].forEach((name,i)=>put(name,records[0][i]||''));}
 else for(const row of rows)put(row[0]||'',row[1]||'');
 return validateOnboarding(raw);
}

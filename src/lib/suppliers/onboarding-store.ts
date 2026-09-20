import 'server-only';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import {mergeOnboarding,validateOnboarding} from './onboarding-input';
import {ONBOARDING_FIELDS,maskedOnboardingValue,type OnboardingValues} from './onboarding-fields';
type Reader=Pick<Prisma.TransactionClient,'$queryRaw'>;
type SupplierRow={id:bigint;name:string;contact_name:string;phone:string;email:string;address:string;registration_number:string;tax_number:string;settlement_terms:string;notes:string;active:number;updated_at:Date};
type OnboardRow={supplier_id:bigint;registration_number:string;store_url:string;encrypted_details:string;revision:number;check_status:string;checked_connection_version:number|null;checked_at:Date|null;check_code:string;check_sample_count:number};
type Connection={id:bigint;external_store_id:string;status:string;version:number};
const baseMap={store_name:'name',contact_name:'contact_name',phone:'phone',email:'email',address:'address',registration_number:'registration_number',tax_number:'tax_number',settlement_terms:'settlement_terms',notes:'notes'} as const;
function key(value:string){if(!/^[a-f0-9]{64}$/i.test(value))throw Error('onboarding_encryption');return Buffer.from(value,'hex');}
export function encryptDetails(values:OnboardingValues,supplierId:bigint,secret:string):string {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from(`supplier-onboarding:${supplierId}`));
 const body=Buffer.concat([cipher.update(JSON.stringify(values),'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function decryptDetails(raw:string,supplierId:bigint,secret:string):OnboardingValues {
 try{const [iv,tag,body,...extra]=raw.split('.');if(extra.length||!body||raw.length>150000)throw Error();const decipher=createDecipheriv('aes-256-gcm',key(secret),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(`supplier-onboarding:${supplierId}`));decipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8'));}catch{throw Error('onboarding_encryption');}
}
function normalizedRegistrationSql(){let sql=Prisma.sql`REPLACE(REPLACE(registration_number,' ',''),'-','')`;for(let i=0;i<10;i++){sql=Prisma.sql`REPLACE(REPLACE(${sql},${String.fromCharCode(1632+i)},${String(i)}),${String.fromCharCode(1776+i)},${String(i)})`;}return sql;}
export async function inspectOnboarding(db:Reader,values:OnboardingValues,secret:string,explicitSupplierId:bigint|null=null){
 const registration=values.registration_number!,storeUrl=values.store_url!;
 const suppliers=await db.$queryRaw<SupplierRow[]>(Prisma.sql`SELECT id,name,contact_name,phone,email,address,registration_number,tax_number,settlement_terms,notes,active,updated_at FROM commerce_suppliers WHERE ${normalizedRegistrationSql()}=${registration} LIMIT 3`);
 if(suppliers.length>1)throw Error('onboarding_duplicate_registration');
 const identities=await db.$queryRaw<OnboardRow[]>`SELECT * FROM supplier_onboarding WHERE registration_number=${registration} OR store_url=${storeUrl}`;
 let existing=suppliers[0];
 if(identities.some(o=>o.store_url===storeUrl&&o.registration_number!==registration))throw Error('onboarding_url_conflict');
 const identity=identities.find(o=>o.registration_number===registration);
 if(identity&&(!existing||identity.supplier_id!==existing.id))throw Error('onboarding_identity_conflict');
 if(explicitSupplierId&&existing?.id!==explicitSupplierId)throw Error('onboarding_identity_conflict');
 if(existing){
  const profiles=await db.$queryRaw<{provider:string}[]>`SELECT provider FROM supplier_integration_profiles WHERE supplier_id=${existing.id}`;
  if(profiles.some(p=>p.provider!=='salla'))throw Error('onboarding_provider_conflict');
 }
 // Legacy API URL is only a conflict hint, never an OAuth endpoint or source of credentials.
 const urlOwners=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_suppliers WHERE LOWER(TRIM(TRAILING '/' FROM api_base_url))=${storeUrl} LIMIT 3`;
 if(urlOwners.some(o=>o.id!==existing?.id))throw Error('onboarding_url_conflict');
 const emailOwners=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_suppliers WHERE LOWER(email)=${values.email||''} AND id<>${existing?.id??0n} LIMIT 1`;
 const warnings=emailOwners.length?['البريد مستخدم لمورد بسجل تجاري مختلف؛ لن يتم دمج الموردين.']:[];
 const connections=existing?await db.$queryRaw<Connection[]>`SELECT id,external_store_id,status,version FROM supplier_connections WHERE supplier_id=${existing.id} AND provider='salla' ORDER BY id DESC LIMIT 20`:[];
 const old:OnboardingValues=identity?decryptDetails(identity.encrypted_details,identity.supplier_id,secret):{};
 if(existing)for(const [field,column]of Object.entries(baseMap))old[field]=String(existing[column as keyof SupplierRow]??'')||null;
 const merged=mergeOnboarding(old,values);
 const changes=ONBOARDING_FIELDS.map(([field,label])=>({key:field,label,before:maskedOnboardingValue(field,old[field]),after:maskedOnboardingValue(field,merged[field]),kind:merged[field]===old[field]||(!merged[field]&&!old[field])?'unchanged' as const:old[field]?'changed' as const:'new' as const}));
 const changedKeys=changes.filter(c=>c.kind!=='unchanged').map(c=>c.key);
 const ordered=(value:OnboardingValues)=>Object.entries(value).filter(([,v])=>v!=='').sort(([a],[b])=>a.localeCompare(b));
 const fingerprint=createHash('sha256').update(JSON.stringify({id:existing?.id.toString()??null,revision:identity?.revision??0,old:ordered(old),values:ordered(values),connections:connections.map(c=>[c.id.toString(),c.status,c.version])})).digest('hex');
 return {existing,identity,connections,old,merged,changes,changedKeys,warnings,fingerprint,connected:connections.some(c=>c.status==='connected')};
}
export function issuePreviewToken(fingerprint:string,adminId:bigint,fileHash:string,secret:string,now=Date.now()){
 const body=Buffer.from(JSON.stringify({fingerprint,adminId:String(adminId),fileHash,expires:now+15*60000})).toString('base64url');return body+'.'+createHmac('sha256',key(secret)).update(body).digest('hex');
}
export function verifyPreviewToken(token:string,adminId:bigint,fileHash:string,secret:string,now=Date.now()):string {
 try{if(token.length>2000)throw Error();const [body,signature,...extra]=token.split('.');if(extra.length||!/^[a-f0-9]{64}$/.test(signature))throw Error();const expected=createHmac('sha256',key(secret)).update(body).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error();const data=JSON.parse(Buffer.from(body,'base64url').toString());if(data.adminId!==String(adminId)||data.fileHash!==fileHash||!Number.isFinite(data.expires)||data.expires<now)throw Error();return String(data.fingerprint);}catch{throw Error('onboarding_preview_expired');}
}
export const onboardingFileHash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function safeOnboardingFilename(name:string){return name.split(/[\\/]/).pop()!.replace(/[^\p{L}\p{N}_. -]/gu,'_').slice(0,120);}
export async function saveOnboarding(db:CommerceDb,input:{values:OnboardingValues;fingerprint:string;filename:string;adminId:bigint;secret:string;canCreate:boolean;canEdit:boolean}){
 const validated=validateOnboarding(input.values);if(validated.errors.length)throw Error('onboarding_validation');
 return db.$transaction(async tx=>{
  // Serialize registration imports, including previously unknown registration numbers.
  await tx.$executeRaw`INSERT IGNORE INTO site_settings(k,v) VALUES('supplier_onboarding_mutex','1')`;
  await tx.$queryRaw`SELECT k FROM site_settings WHERE k='supplier_onboarding_mutex' FOR UPDATE`;
  const state=await inspectOnboarding(tx,validated.values,input.secret);
  if(state.fingerprint!==input.fingerprint)throw Error('onboarding_preview_stale');
  if(state.existing?!input.canEdit:!input.canCreate)throw Error('onboarding_forbidden');
  const v=state.merged;let id=state.existing?.id;
  if(id){
   // Do not change active state, API controls or connection state from a spreadsheet.
   await tx.$executeRaw`UPDATE commerce_suppliers SET name=${v.store_name||''},contact_name=${v.contact_name||''},phone=${v.phone||''},email=${v.email||''},address=${v.address||''},registration_number=${v.registration_number||''},tax_number=${v.tax_number||''},settlement_terms=${v.settlement_terms||''},notes=${v.notes||''},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
  }else{
   // Active profile permits OAuth; products/sync/automatic ordering remain disabled.
   await tx.$executeRaw`INSERT INTO commerce_suppliers(name,contact_name,phone,email,address,registration_number,tax_number,settlement_terms,notes,active,api_enabled) VALUES(${v.store_name||''},${v.contact_name||''},${v.phone||''},${v.email||''},${v.address||''},${v.registration_number||''},${v.tax_number||''},${v.settlement_terms||''},${v.notes||''},1,0)`;
   const [created]=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;id=created.id;
  }
  await tx.$executeRaw`INSERT INTO supplier_integration_profiles(supplier_id,provider,maintenance,sync_enabled,auto_orders_enabled,mode) VALUES(${id},'salla',0,0,0,'development') ON DUPLICATE KEY UPDATE supplier_id=supplier_id`;
  const sealed=encryptDetails(v,id,input.secret);
  await tx.$executeRaw`INSERT INTO supplier_onboarding(supplier_id,registration_number,store_url,encrypted_details) VALUES(${id},${v.registration_number!},${v.store_url!},${sealed}) ON DUPLICATE KEY UPDATE encrypted_details=VALUES(encrypted_details),store_url=VALUES(store_url),revision=revision+1,updated_at=CURRENT_TIMESTAMP(3)`;
  await tx.admin_log.create({data:{admin_id:input.adminId,action:'رفع ملف متجر سلة',target:String(id),note:JSON.stringify({operation:state.existing?'update':'create',filename:safeOnboardingFilename(input.filename),changed:state.changedKeys})}});
  return {supplierId:String(id),storeName:v.store_name!,connected:state.connected,status:'pending' as const};
 },{isolationLevel:'ReadCommitted',timeout:15000});
}

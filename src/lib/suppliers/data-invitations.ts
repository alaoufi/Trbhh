import 'server-only';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import {validateOnboarding} from './onboarding-input';
import {ONBOARDING_FIELDS,type OnboardingValues} from './onboarding-fields';

export const DATA_INVITE_LIFETIME_MS=7*24*60*60*1000;
export type SupplierDataStatus='open'|'draft'|'submitted'|'approved'|'revoked';
type InviteRow={supplier_id:bigint;name?:string;generation:number;status:SupplierDataStatus;encrypted_draft:string|null;expires_at:Date};

function encryptionKey(secret:string){if(!/^[a-f0-9]{64}$/i.test(secret))throw Error('supplier_data_encryption');return Buffer.from(secret,'hex');}
function aad(supplierId:bigint,generation:number){return Buffer.from(`supplier-data-invite:${supplierId}:${generation}`);}
export function invitationTokenHash(token:string):Buffer {
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('supplier_data_invitation_invalid');
 return createHash('sha256').update(token).digest();
}
export function encryptInvitationDraft(values:OnboardingValues,supplierId:bigint,generation:number,secret:string):string {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(secret),iv);cipher.setAAD(aad(supplierId,generation));
 const body=Buffer.concat([cipher.update(JSON.stringify(values),'utf8'),cipher.final()]);
 return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function decryptInvitationDraft(raw:string,supplierId:bigint,generation:number,secret:string):OnboardingValues {
 try{
  const [iv,tag,body,...extra]=raw.split('.');if(extra.length||!iv||!tag||!body||raw.length>150000)throw Error();
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(secret),Buffer.from(iv,'base64url'));decipher.setAAD(aad(supplierId,generation));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  const value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value as OnboardingValues;
 }catch{throw Error('supplier_data_encryption');}
}
function validId(id:bigint){if(!/^[1-9]\d{0,14}$/.test(String(id)))throw Error('supplier_data_invitation_invalid');}
function validOrigin(origin:string){const value=new URL(origin);if(value.protocol!=='https:'||value.username||value.password||value.pathname!=='/'||value.search||value.hash)throw Error('supplier_data_invitation_invalid');return value.origin;}

export async function issueSupplierDataInvitation(db:CommerceDb,supplierId:bigint,adminId:bigint,secret:string,origin:string,now=Date.now()){
 validId(supplierId);validId(adminId);encryptionKey(secret);const base=validOrigin(origin);
 const token=randomBytes(32).toString('base64url'),tokenHash=invitationTokenHash(token),expiresAt=new Date(now+DATA_INVITE_LIFETIME_MS);
 const generation=await db.$transaction(async tx=>{
  const [supplier]=await tx.$queryRaw<{id:bigint;name:string}[]>`SELECT id,name FROM commerce_suppliers WHERE id=${supplierId} FOR UPDATE`;
  if(!supplier)throw Error('supplier_data_supplier_missing');
  const [current]=await tx.$queryRaw<{generation:number}[]>`SELECT generation FROM supplier_data_invitations WHERE supplier_id=${supplierId} FOR UPDATE`;
  const next=(current?.generation??0)+1;if(!Number.isSafeInteger(next)||next>2147483646)throw Error('supplier_data_generation');
  await tx.$executeRaw`INSERT INTO supplier_data_invitations (supplier_id,token_hash,generation,status,encrypted_draft,expires_at,issued_by,submitted_at,approved_at,approved_by,created_at,updated_at) VALUES (${supplierId},${tokenHash},${next},'open',NULL,${expiresAt},${adminId},NULL,NULL,NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),generation=VALUES(generation),status='open',encrypted_draft=NULL,expires_at=VALUES(expires_at),issued_by=VALUES(issued_by),submitted_at=NULL,approved_at=NULL,approved_by=NULL,updated_at=UTC_TIMESTAMP(3)`;
  return next;
 });
 return {token,generation,url:`${base}/supplier/data/${token}`,expiresAt};
}

export async function resolveSupplierDataInvitation(db:Pick<CommerceDb,'$queryRaw'>,token:string,secret:string,now=Date.now()){
 const hash=invitationTokenHash(token);
 const [row]=await db.$queryRaw<InviteRow[]>`SELECT i.supplier_id,s.name,i.generation,i.status,i.encrypted_draft,i.expires_at FROM supplier_data_invitations i JOIN commerce_suppliers s ON s.id=i.supplier_id WHERE i.token_hash=${hash} LIMIT 1`;
 if(!row||row.expires_at.getTime()<=now||!['open','draft','submitted'].includes(row.status))throw Error('supplier_data_invitation_invalid');
 const values=row.encrypted_draft?decryptInvitationDraft(row.encrypted_draft,row.supplier_id,row.generation,secret):{};
 return {supplierId:String(row.supplier_id),supplierName:row.name||'',generation:row.generation,status:row.status,values,expiresAt:row.expires_at.toISOString()};
}

function safeDraftValues(raw:Record<string,unknown>):OnboardingValues {
 const values:OnboardingValues={};
 for(const [key] of ONBOARDING_FIELDS){const input=raw[key];if(input===undefined)continue;const value=String(input??'').normalize('NFKC').trim(),max=key==='store_url'?300:key==='email'?254:key==='address'?500:['notes','returns_policy','damage_policy','settlement_terms','agreements'].includes(key)?2000:200;if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error('supplier_data_form_invalid');values[key]=value||null;}
 return values;
}

export async function saveSupplierDataInvitation(db:CommerceDb,token:string,raw:Record<string,unknown>,submit:boolean,secret:string,now=Date.now()){
 const hash=invitationTokenHash(token),validation=validateOnboarding(raw,{preserveMissingRequired:true});
 if(submit&&validation.errors.length)throw Error('supplier_data_validation');
 return db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<InviteRow[]>`SELECT supplier_id,generation,status,encrypted_draft,expires_at FROM supplier_data_invitations WHERE token_hash=${hash} FOR UPDATE`;
  if(!row||row.expires_at.getTime()<=now||!['open','draft'].includes(row.status))throw Error('supplier_data_invitation_invalid');
  const stored=submit?validation.values:safeDraftValues(raw),encrypted=encryptInvitationDraft(stored,row.supplier_id,row.generation,secret),status:SupplierDataStatus=submit?'submitted':'draft';
  await tx.$executeRaw`UPDATE supplier_data_invitations SET encrypted_draft=${encrypted},status=${status},submitted_at=${submit?new Date(now):null},updated_at=UTC_TIMESTAMP(3) WHERE supplier_id=${row.supplier_id} AND generation=${row.generation} AND token_hash=${hash}`;
  return {status,errors:validation.errors,warnings:validation.warnings,values:stored};
 });
}

export async function revokeSupplierDataInvitation(db:CommerceDb,supplierId:bigint,adminId:bigint){
 validId(supplierId);validId(adminId);
 return db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<{generation:number}[]>`SELECT generation FROM supplier_data_invitations WHERE supplier_id=${supplierId} FOR UPDATE`;
  if(!row)throw Error('supplier_data_invitation_invalid');
  await tx.$executeRaw`UPDATE supplier_data_invitations SET status='revoked',token_hash=${randomBytes(32)},expires_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE supplier_id=${supplierId} AND generation=${row.generation}`;
  return {status:'revoked' as const};
 });
}

export async function approveSubmittedSupplierData(db:CommerceDb,supplierId:bigint,generation:number,adminId:bigint,secret:string,apply:(tx:Prisma.TransactionClient,values:OnboardingValues)=>Promise<void>){
 validId(supplierId);validId(adminId);if(!Number.isSafeInteger(generation)||generation<1)throw Error('supplier_data_review_stale');
 return db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<InviteRow[]>`SELECT supplier_id,generation,status,encrypted_draft,expires_at FROM supplier_data_invitations WHERE supplier_id=${supplierId} FOR UPDATE`;
  if(!row||row.generation!==generation||row.status!=='submitted'||!row.encrypted_draft)throw Error('supplier_data_review_stale');
  const values=decryptInvitationDraft(row.encrypted_draft,supplierId,generation,secret),validation=validateOnboarding(values);
  if(validation.errors.length)throw Error('supplier_data_validation');
  await apply(tx,validation.values);
  await tx.$executeRaw`UPDATE supplier_data_invitations SET status='approved',approved_at=UTC_TIMESTAMP(3),approved_by=${adminId},updated_at=UTC_TIMESTAMP(3) WHERE supplier_id=${supplierId} AND generation=${generation} AND status='submitted'`;
  return {status:'approved' as const};
 });
}

export async function reopenSupplierDataInvitation(db:CommerceDb,supplierId:bigint,generation:number,adminId:bigint,now=Date.now()){
 validId(supplierId);validId(adminId);if(!Number.isSafeInteger(generation)||generation<1)throw Error('supplier_data_review_stale');
 return db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<{generation:number;status:string}[]>`SELECT generation,status FROM supplier_data_invitations WHERE supplier_id=${supplierId} FOR UPDATE`;
  if(!row||row.generation!==generation||row.status!=='submitted')throw Error('supplier_data_review_stale');
  await tx.$executeRaw`UPDATE supplier_data_invitations SET status='draft',submitted_at=NULL,expires_at=${new Date(now+DATA_INVITE_LIFETIME_MS)},updated_at=UTC_TIMESTAMP(3) WHERE supplier_id=${supplierId} AND generation=${generation} AND status='submitted'`;
  return {status:'draft' as const};
 });
}

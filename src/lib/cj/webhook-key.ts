import 'server-only';
import {lstatSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {digest,openTokens} from '@/lib/suppliers/crypto';
export const webhookKeyContext=(apiKey:string)=>'cj:webhook:'+digest(apiKey);
function privateFile(){
 const file=resolve(process.env.STORAGE_DIR||resolve(process.cwd(),'storage'),'cj-webhook-auth.sealed');
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('private_file_invalid');
 return readFileSync(file,'utf8');
}
/** Local provisioned key only: no network or DB work on the webhook hot path. */
export function readCjWebhookOpenId(read:()=>string=privateFile):string{
 try{
  const env=(process.env.CJ_WEBHOOK_OPEN_ID||'').trim();
  if(env)return /^[1-9]\d{0,63}$/.test(env)?env:'';
  const apiKey=process.env.CJ_API_KEY||'',key=process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'';
  if(!apiKey||!/^[a-f0-9]{64}$/i.test(key))return '';
  const raw=read();if(raw.length>4096)return '';
  const value=openTokens(raw.trim(),webhookKeyContext(apiKey),key);
  return value.refreshToken==='cj-webhook-auth-v1'&&/^[1-9]\d{0,63}$/.test(value.accessToken)?value.accessToken:'';
 }catch{return '';}
}

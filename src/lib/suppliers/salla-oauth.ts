import 'server-only';
import {assertOAuthConfig,callbackUrl,type SupplierConfig} from './config';
import {boundedJson} from './http';
export type OAuthGrant={accessToken:string;refreshToken:string;expiresIn:number};
export function authorizationUrl(config:SupplierConfig,state:string):string {
  assertOAuthConfig(config);
  const url=new URL('https://accounts.salla.sa/oauth2/auth');
  url.search=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:callbackUrl(config),scope:'offline_access',state}).toString();
  return url.href;
}
/** Fixed provider hosts only. No redirect, error body, credentials or token logging. */
async function tokenGrant(config:SupplierConfig,fields:Record<string,string>,fetcher:typeof fetch):Promise<OAuthGrant> {
  assertOAuthConfig(config);
  let value:Record<string,unknown>;
  try {
    const response=await fetcher('https://accounts.salla.sa/oauth2/token',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,...fields})});
    value=await boundedJson(response) as Record<string,unknown>;
  } catch {throw new Error('salla_token_request_failed');}
  if(!value || typeof value.access_token!=='string'||!value.access_token||value.access_token.length>16384||typeof value.refresh_token!=='string'||!value.refresh_token||value.refresh_token.length>16384||!Number.isSafeInteger(value.expires_in)||Number(value.expires_in)<=0||Number(value.expires_in)>366*86400)throw new Error('salla_token_response_invalid');
  return {accessToken:value.access_token,refreshToken:value.refresh_token,expiresIn:Number(value.expires_in)};
}
export const exchangeCode=(config:SupplierConfig,code:string,fetcher:typeof fetch=fetch)=>tokenGrant(config,{grant_type:'authorization_code',code,redirect_uri:callbackUrl(config)},fetcher);
export const refreshGrant=(config:SupplierConfig,refreshToken:string,fetcher:typeof fetch=fetch)=>tokenGrant(config,{grant_type:'refresh_token',refresh_token:refreshToken},fetcher);
export async function merchantIdentity(accessToken:string,fetcher:typeof fetch=fetch):Promise<string> {
  try {
    const response=await fetcher('https://accounts.salla.sa/oauth2/user/info',{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    const value=await boundedJson(response) as {success?:boolean;data?:{merchant?:{id?:unknown}}},id=value?.data?.merchant?.id;
    if(value.success!==true||!(typeof id==='string'||Number.isSafeInteger(id))||!/^\d{1,30}$/.test(String(id)))throw new Error();
    return String(id);
  } catch {throw new Error('salla_merchant_request_failed');}
}

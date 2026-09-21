import 'server-only';
import {randomBytes,randomUUID} from 'node:crypto';
import type {CommerceDb} from '@/lib/commerce/types';
import {digest,openTokens,sealTokens} from './crypto';
import {assertOAuthConfig,type SupplierConfig} from './config';
import {authorizationUrl,exchangeCode,merchantIdentity,refreshGrant} from './salla-oauth';
import {parseMerchantContext,verifyInvitedMerchant,type MerchantContext} from './merchant-oauth';

export async function beginOAuth(db:CommerceDb,supplierId:bigint,adminId:bigint,config:SupplierConfig,constraints?:{expectedGeneration:number;requireUnconnected:true}) {
  assertOAuthConfig(config);
  const state=randomBytes(32).toString('hex'),browser=randomBytes(32).toString('hex');
  await db.$transaction(async tx=>{
    const [profile]=await tx.$queryRaw<{provider:string;active:number;maintenance:number;oauth_generation:number}[]>`SELECT p.provider,p.maintenance,s.active,p.oauth_generation FROM supplier_integration_profiles p JOIN commerce_suppliers s ON s.id=p.supplier_id WHERE p.supplier_id=${supplierId} FOR UPDATE`;
    if(!profile||profile.provider!=='salla'||profile.active!==1||profile.maintenance!==0)throw new Error('supplier_connection_unavailable');
    if(constraints){
      if(profile.oauth_generation!==constraints.expectedGeneration)throw new Error('supplier_oauth_superseded');
      const [existing]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_connections WHERE supplier_id=${supplierId} LIMIT 1 FOR UPDATE`;
      if(existing)throw new Error('supplier_merchant_already_connected');
    }
    await tx.$executeRaw`UPDATE supplier_integration_profiles SET oauth_generation=oauth_generation+1 WHERE supplier_id=${supplierId}`;
    await tx.$executeRaw`INSERT INTO supplier_oauth_states(state_hash,browser_hash,admin_id,supplier_id,oauth_generation,expires_at) SELECT ${digest(state)},${digest(browser)},${adminId},supplier_id,oauth_generation,${new Date(Date.now()+600000)} FROM supplier_integration_profiles WHERE supplier_id=${supplierId}`;
  });
  return {url:authorizationUrl(config,state),browser};
}
export async function consumeOAuthState(db:CommerceDb,state:string,browser:string,adminId:bigint,merchant?:MerchantContext):Promise<bigint> {
  if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser)||adminId<=0n)throw new Error('supplier_oauth_state');
  if(merchant&&(merchant.adminId!==String(adminId)||merchant.stateHash!==digest(state)))throw new Error('supplier_merchant_context_invalid');
  return db.$transaction(async tx=>{
    const [row]=merchant
      ? await tx.$queryRaw<{supplier_id:bigint}[]>`SELECT o.supplier_id FROM supplier_oauth_states o JOIN supplier_integration_profiles p ON p.supplier_id=o.supplier_id AND p.oauth_generation=o.oauth_generation WHERE o.state_hash=${digest(state)} AND o.browser_hash=${digest(browser)} AND o.admin_id=${adminId} AND o.supplier_id=${BigInt(merchant.supplierId)} AND o.oauth_generation=${merchant.generation} AND o.consumed_at IS NULL AND o.expires_at>UTC_TIMESTAMP(3) FOR UPDATE`
      : await tx.$queryRaw<{supplier_id:bigint}[]>`SELECT supplier_id FROM supplier_oauth_states WHERE state_hash=${digest(state)} AND browser_hash=${digest(browser)} AND admin_id=${adminId} AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE`;
    if(!row)throw new Error('supplier_oauth_state');
    await tx.$executeRaw`UPDATE supplier_oauth_states SET consumed_at=CURRENT_TIMESTAMP(3) WHERE state_hash=${digest(state)}`;
    return row.supplier_id;
  });
}
export async function completeOAuth(db:CommerceDb,input:{state:string;browser:string;adminId:bigint;code:string;merchantContext?:string},config:SupplierConfig,fetcher:typeof fetch=fetch) {
  assertOAuthConfig(config);
  if(!input.code||input.code.length>8192)throw new Error('supplier_oauth_code');
  const merchant=input.merchantContext===undefined?undefined:parseMerchantContext(input.merchantContext,input.state,config);
  const supplierId=await consumeOAuthState(db,input.state,input.browser,input.adminId,merchant);
  const grant=await exchangeCode(config,input.code,fetcher),storeId=await merchantIdentity(grant.accessToken,fetcher);
  if(merchant)await verifyInvitedMerchant(grant.accessToken,storeId,merchant.expectedName,fetcher);
  const encrypted=sealTokens(grant,`salla:${supplierId}:${storeId}`,config.encryptionKey);
  await db.$transaction(async tx=>{
    const [profile]=await tx.$queryRaw<{provider:string;active:number;maintenance:number}[]>`SELECT p.provider,p.maintenance,s.active FROM supplier_integration_profiles p JOIN commerce_suppliers s ON s.id=p.supplier_id WHERE p.supplier_id=${supplierId} FOR UPDATE`;
    if(!profile||profile.provider!=='salla'||profile.active!==1||profile.maintenance!==0)throw new Error('supplier_connection_unavailable');
    const [attempt]=await tx.$queryRaw<{state_hash:string}[]>`SELECT o.state_hash FROM supplier_oauth_states o JOIN supplier_integration_profiles p ON p.supplier_id=o.supplier_id AND p.oauth_generation=o.oauth_generation WHERE o.state_hash=${digest(input.state)} AND o.consumed_at IS NOT NULL AND o.supplier_id=${supplierId} FOR UPDATE`;
    if(!attempt)throw new Error('supplier_oauth_superseded');
    if(merchant){
      const [targetConnection]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_connections WHERE supplier_id=${supplierId} LIMIT 1 FOR UPDATE`;
      if(targetConnection)throw new Error('supplier_merchant_already_connected');
    }
    const [existing]=await tx.$queryRaw<{id:bigint;supplier_id:bigint}[]>`SELECT id,supplier_id FROM supplier_connections WHERE provider='salla' AND external_store_id=${storeId} FOR UPDATE`;
    if(existing && existing.supplier_id!==supplierId)throw new Error('supplier_store_already_owned');
    const expires=new Date(Date.now()+grant.expiresIn*1000);
    if(existing)await tx.$executeRaw`UPDATE supplier_connections SET encrypted_tokens=${encrypted},expires_at=${expires},status='connected',refresh_claim=NULL,refresh_claimed_at=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${existing.id}`;
    else await tx.$executeRaw`INSERT INTO supplier_connections(supplier_id,provider,external_store_id,status,encrypted_tokens,expires_at) VALUES(${supplierId},'salla',${storeId},'connected',${encrypted},${expires})`;
  });
  return supplierId;
}
type Connection={id:bigint;supplier_id:bigint;external_store_id:string;status:string;active:number;maintenance:number;encrypted_tokens:string|null;expires_at:Date|null;refresh_claim:string|null;refresh_claimed_at:Date|null;version:number};
/** A refresh token is single-use. Durable claim precedes network; ambiguous outcomes require reconnect. */
export async function accessTokenForConnection(db:CommerceDb,id:bigint,config:SupplierConfig,fetcher:typeof fetch=fetch):Promise<string> {
  const claim=randomUUID();
  const result=await db.$transaction(async tx=>{
    const [row]=await tx.$queryRaw<Connection[]>`SELECT c.*,s.active,p.maintenance FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id WHERE c.id=${id} AND c.provider='salla' FOR UPDATE`;
    if(!row||row.status!=='connected'||row.active!==1||row.maintenance!==0||!row.encrypted_tokens)throw new Error('supplier_connection_unavailable');
    if(row.refresh_claim) {
      if(row.refresh_claimed_at && row.refresh_claimed_at.getTime()<Date.now()-120000) {
        await tx.$executeRaw`UPDATE supplier_connections SET status='reconnect_required',encrypted_tokens=NULL,version=version+1 WHERE id=${id}`;
        return {error:'supplier_reconnect_required'} as const;
      }
      throw new Error('supplier_refresh_busy');
    }
    const tokens=openTokens(row.encrypted_tokens,`salla:${row.supplier_id}:${row.external_store_id}`,config.encryptionKey);
    if(row.expires_at && row.expires_at.getTime()>Date.now()+300000)return {token:tokens.accessToken} as const;
    await tx.$executeRaw`UPDATE supplier_connections SET refresh_claim=${claim},refresh_claimed_at=UTC_TIMESTAMP(3) WHERE id=${id}`;
    return {row,tokens} as const;
  });
  if('error' in result)throw new Error(result.error);
  if('token' in result)return result.token!;
  try {
    const grant=await refreshGrant(config,result.tokens.refreshToken,fetcher);
    const encrypted=sealTokens(grant,`salla:${result.row.supplier_id}:${result.row.external_store_id}`,config.encryptionKey);
    const changed=await db.$transaction(tx=>tx.$executeRaw`UPDATE supplier_connections SET encrypted_tokens=${encrypted},expires_at=${new Date(Date.now()+grant.expiresIn*1000)},refresh_claim=NULL,refresh_claimed_at=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id} AND status='connected' AND refresh_claim=${claim} AND version=${result.row.version}`);
    if(changed!==1)throw new Error('supplier_refresh_conflict');
    return grant.accessToken;
  } catch {
    await db.$transaction(tx=>tx.$executeRaw`UPDATE supplier_connections SET status='reconnect_required',encrypted_tokens=NULL,refresh_claim=NULL,refresh_claimed_at=NULL,version=version+1 WHERE id=${id} AND refresh_claim=${claim} AND version=${result.row.version}`);
    throw new Error('supplier_reconnect_required');
  }
}
export async function disconnectConnection(db:CommerceDb,id:bigint) {
  await db.$transaction(async tx=>{
    const [lookup]=await tx.$queryRaw<{supplier_id:bigint}[]>`SELECT supplier_id FROM supplier_connections WHERE id=${id}`;
    if(!lookup)throw new Error('supplier_connection_unavailable');
    await tx.$executeRaw`UPDATE supplier_integration_profiles SET oauth_generation=oauth_generation+1 WHERE supplier_id=${lookup.supplier_id}`;
    await tx.$executeRaw`UPDATE supplier_connections SET status='disconnected',encrypted_tokens=NULL,expires_at=NULL,refresh_claim=NULL,refresh_claimed_at=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
    await tx.$executeRaw`UPDATE commerce_products cp JOIN supplier_products sp ON sp.commerce_product_id=cp.id SET cp.enabled=0 WHERE sp.connection_id=${id}`;
  });
}

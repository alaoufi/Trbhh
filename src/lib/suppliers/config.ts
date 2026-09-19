import 'server-only';

export type SupplierConfig={origin:string;clientId:string;clientSecret:string;encryptionKey:string;webhookSecret:string;cronSecret:string;liveOrders:boolean};
export function supplierConfig(env:Record<string,string|undefined>=process.env):SupplierConfig {
  let url:URL;
  try {url=new URL(env.SUPPLIER_PUBLIC_ORIGIN||'');} catch {throw new Error('supplier_origin_config');}
  const local=env.NODE_ENV!=='production' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:' && !(local&&url.protocol==='http:')) || url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw new Error('supplier_origin_config');
  return {origin:url.origin,clientId:env.SALLA_CLIENT_ID||'',clientSecret:env.SALLA_CLIENT_SECRET||'',encryptionKey:env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'',webhookSecret:env.SALLA_WEBHOOK_SECRET||'',cronSecret:env.SUPPLIER_RECONCILE_SECRET||'',liveOrders:env.SUPPLIER_ALLOW_LIVE_ORDERS==='true'};
}
export const callbackUrl=(config:Pick<SupplierConfig,'origin'>)=>`${config.origin}/api/integrations/salla/callback`;
export const webhookUrl=(config:Pick<SupplierConfig,'origin'>)=>`${config.origin}/api/integrations/salla/webhooks`;
export function assertOAuthConfig(config:SupplierConfig) {
  if(!config.clientId || !config.clientSecret || !/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) throw new Error('supplier_oauth_config');
}

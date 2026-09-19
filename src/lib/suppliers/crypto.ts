import 'server-only';
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export type Tokens={accessToken:string;refreshToken:string};
function key(raw:string) {if(!/^[a-fA-F0-9]{64}$/.test(raw))throw new Error('supplier_encryption_config');return Buffer.from(raw,'hex');}
export const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function sealTokens(tokens:Tokens,context:string,rawKey:string):string {
  if(!tokens.accessToken || !tokens.refreshToken || tokens.accessToken.length>16384 || tokens.refreshToken.length>16384) throw new Error('supplier_token_invalid');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(rawKey),iv);
  cipher.setAAD(Buffer.from(context));
  const body=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function openTokens(sealed:string,context:string,rawKey:string):Tokens {
  try {
    const parts=sealed.split('.');if(parts.length!==4||parts[0]!=='v1'||sealed.length>50000)throw new Error();
    const iv=Buffer.from(parts[1],'base64url'),tag=Buffer.from(parts[2],'base64url');
    if(iv.length!==12||tag.length!==16)throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',key(rawKey),iv);decipher.setAAD(Buffer.from(context));decipher.setAuthTag(tag);
    const value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],'base64url')),decipher.final()]).toString('utf8'));
    if(typeof value.accessToken!=='string'||!value.accessToken||typeof value.refreshToken!=='string'||!value.refreshToken)throw new Error();
    return {accessToken:value.accessToken,refreshToken:value.refreshToken};
  } catch {throw new Error('supplier_token_invalid');}
}
export function verifySignature(raw:Buffer,signature:string,secret:string):boolean {
  if(!secret || !/^[a-fA-F0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(createHmac('sha256',secret).update(raw).digest(),Buffer.from(signature,'hex'));
}
export function constantSecret(actual:string,expected:string):boolean {
  return !!expected&&expected.length>=32&&timingSafeEqual(Buffer.from(digest(actual)),Buffer.from(digest(expected)));
}

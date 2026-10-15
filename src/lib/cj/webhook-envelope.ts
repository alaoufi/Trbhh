import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export function verifyOfficialCjSignature(raw:Buffer,sign:string,openId:string):boolean{
 if(!openId||openId.length>200||!sign||sign.length>128)return false;
 const expected=createHmac('sha256',openId).update(raw).digest('base64');
 return expected.length===sign.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(sign));
}
export function cjWebhookKey(payload:Record<string,unknown>,raw:Buffer):string{
 const id=typeof payload.messageId==='string'&&payload.messageId.length<=200?payload.messageId:null;
 return createHash('sha256').update(id?'message:'+id:raw).digest('hex');
}

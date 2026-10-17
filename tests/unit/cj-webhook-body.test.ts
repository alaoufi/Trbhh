import {describe,it,expect,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {readCjWebhookBody,WebhookBodyTooLarge} from '@/lib/cj/webhook-body';
import {verifyOfficialCjSignature} from '@/lib/cj/webhook-envelope';
function input(parts:Uint8Array[],length?:string){const cancel=vi.fn();let index=0;const body=new ReadableStream<Uint8Array>({pull(c){if(index<parts.length)c.enqueue(parts[index++]);else c.close();},cancel});return {request:{body,headers:new Headers(length?{'content-length':length}:{})},cancel};}
describe('bounded raw webhook body',()=>{
 it('rejects declared overflow before reading and cancels the body',async()=>{const f=input([Buffer.from('body')],'100');await expect(readCjWebhookBody(f.request,4)).rejects.toBeInstanceOf(WebhookBodyTooLarge);expect(f.cancel).toHaveBeenCalledOnce();});
 it.each([undefined,'1'])('caps actual chunked bytes despite content length %s',async length=>{const f=input([Buffer.from('123'),Buffer.from('456'),Buffer.from('789')],length);await expect(readCjWebhookBody(f.request,5)).rejects.toBeInstanceOf(WebhookBodyTooLarge);expect(f.cancel).toHaveBeenCalledOnce();});
 it('preserves exact split multibyte raw bytes and valid HMAC at the limit',async()=>{const raw=Buffer.from('{"name":"عربي"}\r\n'),f=input([raw.subarray(0,10),raw.subarray(10,12),raw.subarray(12)]);const result=await readCjWebhookBody(f.request,raw.length);expect(result).toEqual(raw);expect(verifyOfficialCjSignature(result,createHmac('sha256','123456').update(raw).digest('base64'),'123456')).toBe(true);expect(f.cancel).not.toHaveBeenCalled();});
 it('accepts an empty body',async()=>{expect(await readCjWebhookBody({body:null,headers:new Headers()},4)).toEqual(Buffer.alloc(0));});
});

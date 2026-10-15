import {createHmac} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {verifyOfficialCjSignature,cjWebhookKey} from '@/lib/cj/webhook-envelope';
describe('CJ official webhook envelope',()=>{
 it('accepts documented base64 HMAC with the account openId, rejecting tampered bodies',()=>{const raw=Buffer.from('{"messageId":"M1"}'),sign=createHmac('sha256','123456').update(raw).digest('base64');expect(verifyOfficialCjSignature(raw,sign,'123456')).toBe(true);expect(verifyOfficialCjSignature(Buffer.from('{}'),sign,'123456')).toBe(false);expect(verifyOfficialCjSignature(raw,sign,'')).toBe(false);});
 it('deduplicates message retries but retains different updates for the same order',()=>{expect(cjWebhookKey({messageId:'M1'},Buffer.from('a'))).toBe(cjWebhookKey({messageId:'M1'},Buffer.from('b')));expect(cjWebhookKey({messageId:'M1'},Buffer.from('a'))).not.toBe(cjWebhookKey({messageId:'M2'},Buffer.from('a')));expect(cjWebhookKey({},Buffer.from('a'))).not.toBe(cjWebhookKey({},Buffer.from('b')));});
});

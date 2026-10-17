import {describe,it,expect,vi,afterEach} from 'vitest';
import {sealTokens} from '@/lib/suppliers/crypto';
import {readCjWebhookOpenId,webhookKeyContext} from '@/lib/cj/webhook-key';
const key='ab'.repeat(32);
afterEach(()=>vi.unstubAllEnvs());
describe('private CJ webhook signing identity',()=>{
 it('decrypts a file bound to the API account without exposing invalid file contents',()=>{vi.stubEnv('CJ_WEBHOOK_OPEN_ID','');vi.stubEnv('CJ_API_KEY','test-account');vi.stubEnv('SUPPLIER_TOKEN_ENCRYPTION_KEY',key);const sealed=sealTokens({accessToken:'123456',refreshToken:'cj-webhook-auth-v1'},webhookKeyContext('test-account'),key);expect(readCjWebhookOpenId(()=>sealed)).toBe('123456');vi.stubEnv('CJ_API_KEY','different-account');expect(readCjWebhookOpenId(()=>sealed)).toBe('');expect(readCjWebhookOpenId(()=>{throw Error('private-details');})).toBe('');});
 it('retains configured environment precedence and rejects malformed identity',()=>{vi.stubEnv('CJ_WEBHOOK_OPEN_ID','123456');const read=vi.fn();expect(readCjWebhookOpenId(read)).toBe('123456');expect(read).not.toHaveBeenCalled();vi.stubEnv('CJ_WEBHOOK_OPEN_ID','invalid');expect(readCjWebhookOpenId(read)).toBe('');});
});

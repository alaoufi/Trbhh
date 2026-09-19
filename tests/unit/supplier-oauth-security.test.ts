import {describe,expect,it} from 'vitest';
import {supplierConfig, callbackUrl, webhookUrl} from '@/lib/suppliers/config';
import {sealTokens, openTokens, digest, verifySignature} from '@/lib/suppliers/crypto';

const key='ab'.repeat(32);
describe('supplier OAuth security primitives',()=>{
  it('derives real routes from an explicitly trusted origin',()=>{
    const config=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SALLA_CLIENT_ID:'client',SALLA_CLIENT_SECRET:'secret',SUPPLIER_TOKEN_ENCRYPTION_KEY:key});
    expect(callbackUrl(config)).toBe('https://trbhh.sa/api/integrations/salla/callback');
    expect(webhookUrl(config)).toBe('https://trbhh.sa/api/integrations/salla/webhooks');
    expect(config.liveOrders).toBe(false);
  });
  it.each(['http://trbhh.sa','https://a:b@trbhh.sa','https://trbhh.sa/path','https://trbhh.sa/?x=1','https://trbhh.sa/#x'])('rejects unsafe or ambiguous origin %s',origin=>{
    expect(()=>supplierConfig({SUPPLIER_PUBLIC_ORIGIN:origin})).toThrow();
  });
  it('does not invent credentials or an origin',()=>expect(()=>supplierConfig({})).toThrow());
  it('encrypts tokens with unique IVs and connection-bound authentication',()=>{
    const tokens={accessToken:'test-access',refreshToken:'test-refresh'};
    const one=sealTokens(tokens,'salla:1:44',key),two=sealTokens(tokens,'salla:1:44',key);
    expect(one).not.toBe(two);expect(one).not.toContain('test-access');
    expect(openTokens(one,'salla:1:44',key)).toEqual(tokens);
    expect(()=>openTokens(one,'salla:2:44',key)).toThrow();
    expect(()=>openTokens(one,'salla:1:44','cd'.repeat(32))).toThrow();
  });
  it('rejects malformed keys and ciphertext without returning secrets',()=>{
    expect(()=>sealTokens({accessToken:'x',refreshToken:'y'},'context','weak')).toThrow('supplier_encryption_config');
    expect(()=>openTokens('broken','context',key)).toThrow('supplier_token_invalid');
  });
  it('hashes state and verifies exact raw bytes, never parsed/reserialized JSON',()=>{
    expect(digest('state')).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignature(Buffer.from('{}'),'bad','secret')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { assertSandboxDatabase, sandboxRequestAllowed, parseSandboxWrite } from '../../src/lib/preview-sandbox';

describe('writable sandbox isolation', () => {
  it('only accepts the dedicated database on isolated or loopback hosts', () => {
    expect(() => assertSandboxDatabase('mysql://test:test@preview-db:3306/trbhh_preview_v2')).not.toThrow();
    for (const url of ['mysql://test:test@host.docker.internal:3306/trbhhdb', 'mysql://test:test@preview-db:3306/trbhhdb', 'mysql://test:test@example.com/trbhh_preview_v2', 'mysql://test:test@preview-db/trbhh_preview_v2?socket=/tmp/mysql.sock']) {
      expect(() => assertSandboxDatabase(url)).toThrow('Invalid sandbox database');
    }
  });
  it('allows only public browsing, sandbox login and state persistence', () => {
    expect(sandboxRequestAllowed('GET', '/ads/123')).toBe(true);
    expect(sandboxRequestAllowed('POST', '/login')).toBe(false);
    expect(sandboxRequestAllowed('POST', '/api/preview-login')).toBe(true);
    expect(sandboxRequestAllowed('PUT', '/api/preview-state')).toBe(true);
    for (const path of ['/admin', '/api/pay/callback/a', '/wallet', '/api/push', '/register', '/api/preview-state/../pay', '/%61dmin']) {
      expect(sandboxRequestAllowed('GET', path)).toBe(false);
      expect(sandboxRequestAllowed('POST', path)).toBe(false);
    }
    expect(sandboxRequestAllowed('POST', '/ads/new')).toBe(false);
  });
  it('rejects unbounded, unversioned or unknown state writes', () => {
    expect(parseSandboxWrite({ownerId:1001,key:'ad-draft-v1',value:null,revision:0})).toEqual({ownerId:1001,key:'ad-draft-v1',value:null,revision:0});
    for (const value of [{key:'auth',value:{},revision:0},{key:'seller-ads-v1',value:[]},{key:'seller-ads-v1',value:[],revision:-1},{key:'seller-ads-v1',value:{},revision:0}]) expect(() => parseSandboxWrite({ownerId:1001,...value})).toThrow();
  });
});

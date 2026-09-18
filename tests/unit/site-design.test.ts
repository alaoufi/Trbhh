import { expect, it } from 'vitest';
import * as api from '../../src/lib/site-design';
it('keeps classic by default, preserves every legacy design and gates v2', () => {
    expect(api.resolveSiteDesign).toBeTypeOf('function');
    for (const raw of [undefined, null, '', 'unknown', 'V2', 'v2; path=/'])
        expect(api.resolveSiteDesign(raw, true)).toBe('');
    for (const raw of ['aurora', 'shop', 'list', 'flat', 'soft', 'sharp']) {
        expect(api.resolveSiteDesign(raw, false)).toBe(raw);
        expect(api.resolveSiteDesign(raw, true)).toBe(raw);
    }
    expect(api.resolveSiteDesign('v2', false)).toBe('');
    expect(api.resolveSiteDesign('v2', true)).toBe('v2');
    expect(api.DEFAULT_SITE_DESIGN_CONFIG.enabled).toBe(false);
    expect(Object.keys(api.DEFAULT_SITE_DESIGN_CONFIG).sort()).toEqual(['description', 'enabled', 'label']);
});
it('excludes admin, payments, authentication and independent storefront routes', () => {
    expect(api.isPublicDesignPath).toBeTypeOf('function');
    for (const path of ['/admin', '/admin/settings', '/payment/result', '/account/wallet', '/account/topup', '/promote', '/account/promos', '/packages', '/guide/topup', '/login', '/register/international', '/forgot', '/store', '/store-login', '/store-forgot', '/companies/17', '/companies/shop/p/2', '/guide/store', '/api/payments/callback'])
        expect(api.isPublicDesignPath(path), path).toBe(false);
    for (const path of ['/', '/search', '/ads/12', '/account/design', '/account/favorites', '/requests'])
        expect(api.isPublicDesignPath(path), path).toBe(true);
});

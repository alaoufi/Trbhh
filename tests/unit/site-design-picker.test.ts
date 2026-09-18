import { afterEach, expect, it, vi } from 'vitest';
import { applyDesign, DESIGNS, availableDesigns } from '../../src/components/design-picker';
afterEach(() => vi.unstubAllGlobals());
it('only exposes the admin-labelled option when enabled', () => {
    const config = { enabled: false, label: 'تصميم مخصص', description: 'وصف من الإدارة' };
    expect(availableDesigns(config).some(d => d.id === 'v2')).toBe(false);
    expect(availableDesigns({ ...config, enabled: true }).find(d => d.id === 'v2')).toEqual({ id: 'v2', name: config.label, desc: config.description });
});
it('never touches browser APIs during server execution', () => {
    expect(() => applyDesign('v2', false)).not.toThrow();
});
it('validates the preference before writing a cookie and preserves the theme', () => {
    const attrs: Record<string, string> = { 'data-theme': 'night' };
    const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; } }, cookie: '' };
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', document);
    applyDesign('v2; path=/admin', true);
    expect(document.cookie).toBe('design=; path=/; max-age=31536000; samesite=lax');
    applyDesign('v2', false);
    expect(attrs['data-design']).toBeUndefined();
    applyDesign('v2', true);
    expect(attrs['data-design']).toBe('v2');
    expect(document.cookie).toContain('design=v2;');
    applyDesign('shop', false);
    expect(attrs['data-design']).toBe('shop');
    expect(attrs['data-theme']).toBe('night');
    expect(DESIGNS.some(d => d.id === 'v2')).toBe(false);
});

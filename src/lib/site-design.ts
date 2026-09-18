export type SiteDesignConfig = {
    enabled: boolean;
    label: string;
    description: string;
};
export const DEFAULT_SITE_DESIGN_CONFIG: SiteDesignConfig = {
    enabled: false, label: 'تربح V2', description: 'بطاقات بصور كبيرة ومساحات هادئة بألوان ورقية وذهبية',
};
const LEGACY_DESIGNS = ['aurora', 'shop', 'list', 'flat', 'soft', 'sharp'] as const;
export function resolveSiteDesign(raw: unknown, enabled: boolean): string {
    if (typeof raw !== 'string')
        return '';
    return (LEGACY_DESIGNS as readonly string[]).includes(raw) || (raw === 'v2' && enabled) ? raw : '';
}
/** Presentation boundary only; never used as an authorization decision. */
export function isPublicDesignPath(path: string): boolean {
    const pathname = path.split('?')[0];
    return !/^\/(admin|api|payment|payments|checkout|pay|packages|promote|login|logout|register|forgot|reset|auth|verify|store|store-login|store-forgot)(\/|$)/.test(pathname)
        && !/^\/companies\/[^/]+/.test(pathname)
        && !/^\/guide\/(store|topup)(\/|$)/.test(pathname)
        && !/^\/account\/(wallet|credit|topup|promos|verify|security)(\/|$)/.test(pathname);
}

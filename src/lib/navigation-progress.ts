/** Whether a clicked href changes the current page inside this same site. */
export function isInternalNavigationUrl(href: string, currentHref: string): boolean {
  try {
    const target = new URL(href, currentHref);
    const current = new URL(currentHref);
    if (target.origin !== current.origin) return false;
    if (target.pathname === current.pathname && target.search === current.search) return false;
    return true;
  } catch {
    return false;
  }
}

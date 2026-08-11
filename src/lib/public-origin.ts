/** The only public platform origin advertised to crawlers and shared links. */
export const primaryOrigin = 'https://trbhh.sa';

/**
 * Reverse proxies can run Next with an internal bind host (for example 0.0.0.0).
 * Prefer the original public host supplied by the proxy, then the Host header.
 */
export function requestHostname(forwardedHost: string | null, hostHeader: string | null, fallback: string): string {
  for (const value of [forwardedHost, hostHeader, fallback]) {
    const raw = value?.split(',')[0]?.trim();
    if (!raw) continue;
    try {
      return new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
    } catch {
      // Try the next available source instead of using a malformed host.
    }
  }
  return '';
}

/**
 * Convert a legacy apex URL to the preferred Saudi domain.
 * Store subdomains intentionally return null and retain their own routing.
 */
export function redirectLegacyApex(hostname: string, pathname: string, search: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'trbhh.com' && host !== 'www.trbhh.com') return null;
  return `${primaryOrigin}${pathname || '/'}${search}`;
}

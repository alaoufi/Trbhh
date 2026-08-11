/** The only public platform origin advertised to crawlers and shared links. */
export const primaryOrigin = 'https://trbhh.sa';

/**
 * Convert a legacy apex URL to the preferred Saudi domain.
 * Store subdomains intentionally return null and retain their own routing.
 */
export function redirectLegacyApex(hostname: string, pathname: string, search: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'trbhh.com' && host !== 'www.trbhh.com') return null;
  return `${primaryOrigin}${pathname || '/'}${search}`;
}

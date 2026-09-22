import type { AnchorHTMLAttributes } from 'react';

/** Local navigation only; preserve the fixture's read-only/uninitialized mode. */
export default function FixtureLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const mode = new URLSearchParams(window.location.search).get('mode');
  const url = new URL(String(props.href || '/admin/access-control'), window.location.origin);
  if (mode) url.searchParams.set('mode', mode);
  return <a {...props} href={`${url.pathname}${url.search}`} />;
}

import type { AnchorHTMLAttributes } from 'react';

/** Plain local navigation replaces Next router prefetch only; page components stay real. */
export default function FixtureLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}

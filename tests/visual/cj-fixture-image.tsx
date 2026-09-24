import type { ComponentProps } from 'react';
type Props = ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean; priority?: boolean };
export default function FixtureImage({ fill, unoptimized: _unoptimized, priority: _priority, ...props }: Props) {
  // Native local image rendering only; no optimizer or network surface is added.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} style={{ ...props.style, ...(fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : {}) }} />;
}

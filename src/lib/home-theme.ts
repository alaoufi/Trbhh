export type HomeTheme = 'market' | 'classic';

/** Homepage layout is independent of the site's global visual design. */
export function resolveHomeTheme(value?: string): HomeTheme {
  return value === 'classic' ? 'classic' : 'market';
}

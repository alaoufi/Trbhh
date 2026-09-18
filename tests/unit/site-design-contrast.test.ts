import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync('src/app/v2-design.css', 'utf8');
function luminance(hex: string) {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
  const rgb = full.slice(1).match(/../g)!.map(c => {
    const s = parseInt(c, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
it.each(['day', 'night'])('V2 small price, intent and CTA text meet AA in %s mode', mode => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  const tokens: Record<string, string> = {};
  for (const [ , selector, body] of blocks) {
    if (!selector.trim().endsWith('.public-site-shell') || (mode === 'day' && selector.includes('night'))) continue;
    for (const [, key, value] of body.matchAll(/(--v2-[\w-]+):\s*(#[\da-f]+)/g)) tokens[key] = value;
  }
  function color(selector: string, property: string) {
    const body = blocks.find(([, s]) => s.trim().endsWith(selector))![2];
    const value = body.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))![1].trim();
    return value.startsWith('var(') ? tokens[value.slice(4, -1)] : value;
  }
  for (const [foreground, background] of [
    [color('.ad-card-v2-price', 'color'), tokens['--v2-card']],
    [color('.ad-card-v2-intent', 'color'), tokens['--v2-card']],
    [color('.home-discovery-heading > a', 'color'), color('.home-discovery-heading > a', 'background')],
  ]) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    expect((values[0] + .05) / (values[1] + .05), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
});

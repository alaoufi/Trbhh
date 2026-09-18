import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import * as provider from '@/components/site-design-provider';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it('shares the validated server selection with every consumer on SSR and refreshed props', () => {
  expect(provider).toHaveProperty('useSiteDesign');
  const api = provider as typeof provider & { useSiteDesign: () => { selected: string } };
  function Consumer() { return createElement('span', null, api.useSiteDesign().selected); }
  for (const [selected, enabled, expected] of [['v2', true, 'v2'], ['shop', true, 'shop'], ['v2', false, '']] as const) {
    const html = renderToStaticMarkup(createElement(provider.SiteDesignProvider, {
      config: { enabled, label: 'V2', description: '' }, selected,
    }, createElement('div', null, createElement(Consumer), createElement(Consumer))));
    expect(html).toBe(`<div><span>${expected}</span><span>${expected}</span></div>`);
  }
});
it('both selectors delegate selection to the provider instead of private current state', () => {
  for (const path of ['src/components/design-picker.tsx', 'src/app/account/design/page.tsx']) {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('useSiteDesign()');
    expect(source).not.toContain('setCurrent');
  }
  expect(readFileSync('src/app/layout.tsx', 'utf8')).toContain('selected={design}');
});

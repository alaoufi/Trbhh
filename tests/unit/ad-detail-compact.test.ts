import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
vi.mock('next/image', () => ({ default: ({ fill: _fill, priority: _priority, ...props }: Record<string, unknown>) => React.createElement('img', props) }));
vi.mock('@/components/product-image-zoom', () => ({ ProductImageZoom: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-zoom': true }, children) }));
import { AdGallery } from '@/components/ad-gallery';
const render = (images: string[]) => renderToStaticMarkup(React.createElement(AdGallery, { images, title: 'Actual ad' }));
describe('compact actual ad detail gallery', () => {
  it('bounds the main image and renders small accessible thumbnail controls', () => {
    const html = render(['/one.jpg', '/two.jpg', '/three.jpg', '/four.jpg', '/five.jpg']);
    expect(html).toContain('max-w-[440px]');
    expect(html).toContain('h-[240px]');
    expect(html).toContain('md:h-[320px]');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('md:flex-col');
    expect(html.match(/sizes="52px"/g)).toHaveLength(5);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
    expect(html).toContain('data-zoom="true"');
    expect(html).toContain('aria-label="التالي"');
    expect(html).not.toContain('grid-cols-5');
  });
  it('handles empty and single-image ads without redundant navigation', () => {
    expect(render([])).toBe('');
    const html = render(['/one.jpg']);
    expect(html).toContain('/one.jpg');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('aria-label="التالي"');
  });
  it('groups real gallery and metadata above existing purchase controls', () => {
    const source = readFileSync('src/app/ads/[id]/page.tsx', 'utf8');
    const overview = source.indexOf('data-ad-detail-overview');
    const gallery = source.indexOf('<AdGallery', overview);
    const title = source.indexOf('<h1', gallery);
    const description = source.indexOf('<ExpandableDetail', title);
    const purchase = source.indexOf('{directSale && (', description);
    expect(overview).toBeGreaterThan(0);
    expect(gallery).toBeGreaterThan(overview);
    expect(title).toBeGreaterThan(gallery);
    expect(description).toBeGreaterThan(title);
    expect(purchase).toBeGreaterThan(description);
    expect(source.slice(overview - 100, overview)).toContain('md:grid-cols-[minmax(0,440px)_minmax(0,1fr)]');
    expect(source.slice(description, purchase)).toContain('</div>\n      </div>');
  });
});
import { describe, expect, it } from 'vitest';
import { containedImageRect, zoomPanelRect, lensPosition, constrainTransform, pinchTransform } from '@/lib/product-image-zoom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductImageZoom } from '@/components/product-image-zoom';

it('keeps gallery content outside buttons and provides an accessible expand control', () => {
  const props = { src: '/a.jpg', alt: 'منتج', children: createElement('button', {}, 'fallback') };
  const html = renderToStaticMarkup(createElement(ProductImageZoom, props));
  expect(html).toContain('aria-label="تكبير صورة منتج"');
  expect(html).not.toMatch(/<button[^>]*><button/);
  expect(html).toContain('<dialog');
});

it('provides optional accessible modal gallery navigation', () => {
  const props = { src: '/a.jpg', alt: 'منتج', children: null, onPrevious: () => {}, onNext: () => {}, positionLabel: '2 / 3' };
  const html = renderToStaticMarkup(createElement(ProductImageZoom, props));
  expect(html).toContain('aria-label="الصورة السابقة"');
  expect(html).toContain('aria-label="الصورة التالية"');
  expect(html).toContain('2 / 3');
});

describe('product image zoom geometry', () => {
  it('excludes contain letterboxing from image coordinates', () => {
    expect(containedImageRect({ left: 10, top: 20, width: 400, height: 400 }, 800, 400)).toEqual({ left: 10, top: 120, width: 400, height: 200 });
    expect(containedImageRect({ left: 0, top: 0, width: 400, height: 400 }, 0, 0)).toBeNull();
  });
  it('places the preview right, then left, then inside the viewport', () => {
    expect(zoomPanelRect({ left: 20, top: 30, width: 300, height: 300 }, 1000, 700).left).toBe(336);
    expect(zoomPanelRect({ left: 650, top: 30, width: 300, height: 300 }, 1000, 700).left).toBe(274);
    const inset = zoomPanelRect({ left: 100, top: 30, width: 300, height: 300 }, 500, 300);
    expect(inset.left + inset.width).toBeLessThanOrEqual(488);
    expect(inset.top + inset.height).toBeLessThanOrEqual(288);
  });
  it('keeps lens and sampled center inside the visible image', () => {
    expect(lensPosition({ left: 10, top: 20, width: 400, height: 200 }, -10, 900, 100, 80)).toEqual({ left: 10, top: 140, centerX: 60, centerY: 180 });
  });
  it('constrains zoom and panning to the displayed image edges', () => {
    expect(constrainTransform({ scale: 9, x: 999, y: -999 }, 200, 100)).toEqual({ scale: 4, x: 300, y: -150 });
    expect(constrainTransform({ scale: 1, x: 30, y: 40 }, 200, 100)).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it('keeps the pinch anchor stationary while scaling and moving its midpoint', () => {
    expect(pinchTransform({ scale: 1, x: 0, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 10 }, 2, 400, 400)).toEqual({ scale: 2, x: -10, y: 10 });
  });
});

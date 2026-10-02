import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('preview routes and site menu accessibility', () => {
  it('renders disabled deals as an explicit Arabic empty state instead of a soft 404', () => {
    const page = readFileSync('src/app/deals/page.tsx', 'utf8');
    expect(page).not.toContain("from 'next/navigation'");
    expect(page).not.toContain('notFound()');
    expect(page).toContain('العروض غير مفعّلة حالياً');
  });

  it('provides an Arabic noindex not-found page', () => {
    expect(existsSync('src/app/not-found.tsx')).toBe(true);
    if (!existsSync('src/app/not-found.tsx')) return;
    const page = readFileSync('src/app/not-found.tsx', 'utf8');
    expect(page).toContain("robots: { index: false, follow: false }");
    expect(page).toContain('الصفحة غير موجودة');
    expect(page).toContain('العودة للرئيسية');
  });

  it('labels the drawer and implements Escape, focus trap, focus restore and background isolation', () => {
    const menu = readFileSync('src/components/site-menu.tsx', 'utf8');
    expect(menu).toContain('aria-labelledby="site-menu-title"');
    expect(menu).toContain('id="site-menu-title"');
    expect(menu).toContain("event.key === 'Escape'");
    expect(menu).toContain("event.key !== 'Tab'");
    expect(menu).toContain('trigger?.focus({ preventScroll: true })');
    expect(menu).toContain('overscroll-contain');
    expect(menu).toContain("root.style.overflow = 'hidden'");
    expect(menu).toContain("position: 'fixed'");
    expect(menu).toContain("window.scrollTo({ left: x, top: y, behavior: 'instant' })");
    expect(menu).toContain("setAttribute('inert', '')");
    expect(menu).toContain('removeAttribute(\'inert\')');
  });
});

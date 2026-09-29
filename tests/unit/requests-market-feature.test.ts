import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('requests market feature switch', () => {
  it('guards the page and hides the global entry point when disabled', () => {
    const page = readFileSync('src/app/requests/page.tsx', 'utf8');
    const header = readFileSync('src/components/header.tsx', 'utf8');
    const menu = readFileSync('src/components/site-menu.tsx', 'utf8');
    expect(page).toContain("getSettingBool('requests_market_on', true)");
    expect(page).toContain('if (!on) notFound()');
    expect(header).toContain("getSettingBool('requests_market_on', true)");
    expect(menu).toContain('requestsOn && <Item href="/requests"');
  });
});

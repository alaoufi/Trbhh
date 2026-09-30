import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const setup = readFileSync('tests/preview/setup.test.ts', 'utf8');
const browser = readFileSync('tests/preview/browser.cjs', 'utf8');

describe('isolated pre-production browser gate', () => {
  it('keeps the synthetic fixture on the dedicated loopback database', () => {
    expect(setup).toContain('COMMERCE_PREVIEW_DATABASE_URL');
    expect(setup).toContain("url.hostname !== '127.0.0.1'");
    expect(setup).toContain("url.pathname !== '/trbhh_commerce_preview_20260919'");
    expect(setup).toContain("COMMERCE_PREVIEW_FIXTURE !== '1'");
  });

  it('runs the browser journey in CI and keeps its screenshots', () => {
    expect(workflow).toContain('Seed isolated browser preview');
    expect(workflow).toContain('Browser end-to-end on isolated preview');
    expect(workflow).toContain('upload-artifact@v4');
    expect(workflow).toContain('SUPPLIER_ALLOW_LIVE_ORDERS: \'false\'');
  });

  it('covers create, details, edit, search, and delete for a synthetic ad', () => {
    expect(browser).toContain("journey:'create-ad'");
    expect(browser).toContain("journey:'ad-details'");
    expect(browser).toContain("journey:'edit-ad'");
    expect(browser).toContain("journey:'search-ad'");
    expect(browser).toContain("journey:'delete-ad'");
    expect(browser).toContain('PREVIEW_ARTIFACTS_DIR');
  });
});

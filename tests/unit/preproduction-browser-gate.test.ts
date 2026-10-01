import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const setup = readFileSync('tests/preview/setup.test.ts', 'utf8');
const browser = readFileSync('tests/preview/browser.cjs', 'utf8');
const vitestConfig = readFileSync('vitest.config.ts', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');

describe('isolated pre-production browser gate', () => {
  it('keeps the synthetic fixture on the dedicated loopback database', () => {
    expect(setup).toContain('COMMERCE_PREVIEW_DATABASE_URL');
    expect(setup).toContain("url.hostname !== '127.0.0.1'");
    expect(setup).toContain("url.pathname !== '/trbhh_commerce_preview_20260919'");
    expect(setup).toContain("COMMERCE_PREVIEW_FIXTURE !== '1'");
    expect(setup).toContain("'commerce_receipts'");
    expect(setup).toContain('PREVIEW_SEEDED_AD_AGE_MS');
    expect(dockerfile).toContain('COPY --from=builder --chown=nextjs:nodejs /app/database ./database');
    expect(dockerfile).toContain('COPY --from=builder --chown=nextjs:nodejs /app/scripts/release/audit-live-ad-quality.cjs');
    expect(dockerfile).toContain('activate-categories.cjs build > scripts/release/category-seeds.json');
    expect(dockerfile).toContain('/app/scripts/release/category-seeds.json ./scripts/release/category-seeds.json');
  });

  it('runs the browser journey in CI and keeps its screenshots', () => {
    expect(workflow).toContain('Seed isolated browser preview');
    expect(workflow).toContain('Browser end-to-end on isolated preview');
    expect(workflow).toContain('Category transactions on isolated MySQL');
    expect(vitestConfig).toContain("process.env.CATEGORIES_DB_TESTS === '1'");
    expect(vitestConfig).toContain("'/trbhh_categories_test'");
    expect(workflow).toContain('upload-artifact@v4');
    expect(workflow).toContain('SUPPLIER_ALLOW_LIVE_ORDERS: \'false\'');
  });

  it('makes preview deployment prove read-only audit and noindex behavior', () => {
    const deploy = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
    expect(deploy).toContain('audit-live-ad-quality.cjs');
    expect(deploy).toContain('AD_QUALITY_SUMMARY=');
    expect(deploy).toContain('crawl-public-preview.cjs');
    expect(deploy).toContain('PUBLIC_CRAWL=');
    expect(deploy).toContain('report.schema');
    expect(deploy).toContain('report.countAlignment');
    expect(deploy).toContain('report.taxonomyResolution');
    expect(deploy).toContain('report.businessDecisions');
    expect(deploy).toContain('x-robots-tag');
    expect(deploy).toContain('noindex, nofollow, noarchive');
    expect(deploy).toContain("'/search' '/deals' '/nearby' '/companies' '/shop' '/guide' '/site-map'");
    expect(deploy).toContain('previewRecentLogs=clean');
    expect(deploy).toContain('wait_for_preview_200');
    expect(deploy).toContain('wait_for_preview_container');
    expect(deploy).toContain('previewContainerReady=running');
    expect(deploy).toContain('ps -aq app');
    expect(deploy).toContain('previewHttpReady=');
  });

  it('covers create, details, edit, search, and delete for a synthetic ad', () => {
    expect(browser).toContain("journey:'location-create-without-gps'");
    expect(browser).toContain("journey:'location-create-with-gps'");
    expect(browser).toContain("journey:'location-details'");
    expect(browser).toContain("journey:'location-edit'");
    expect(browser).toContain("journey:'location-errors'");
    expect(browser).toContain("journey:'search-ad'");
    expect(browser).toContain("journey:'delete-location-test-ads'");
    expect(browser).toContain("haversineKm:9.290582150657464");
    expect(browser).toContain("directionsDestination:'24.713612,46.675312'");
    expect(browser).toContain("permissionDenied:'passed'");
    expect(browser).toContain("positionUnavailable:'passed'");
    expect(browser).toContain("timeout:'passed'");
    expect(browser).toContain("Nearby reuses session coordinates without another browser prompt");
    expect(browser).toContain("journey:'commerce-product-auth-guard'");
    expect(browser).toContain('schemaFamilyJourneys:schemaFamilies.length');
    expect(browser).toContain('schemaFamilyLifecycleJourneys:schemaFamilies.length');
    expect(browser).toContain("journey:'schema-family-lifecycle'");
    expect(browser).toContain("searchParams.set('category',categoryValue)");
    expect(browser).toContain("searchParams.set('subcategory',leafValue)");
    expect(browser).toContain("family:'livestock'");
    expect(browser).toContain("family:'plants'");
    for (const family of ['heavy-equipment','contracting','electronics','appliances','decor','food','furniture']) {
      expect(browser).toContain(`family:'${family}'`);
    }
    expect(browser).toContain('PREVIEW_ARTIFACTS_DIR');
    expect(browser).toContain('fillRequiredCategoryFields');
    for (const width of [360, 390, 412, 768, 1024, 1440]) expect(browser).toContain(String(width));
  });
});

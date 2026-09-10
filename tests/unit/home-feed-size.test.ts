import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const homePage = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

describe('home feed first load', () => {
  it('loads only the first batch rather than serializing the entire monthly feed', () => {
    const batch = homePage.match(/getHomeLatestAds\((\d+)\)/);
    expect(batch).not.toBeNull();
    expect(Number(batch![1])).toBeGreaterThan(0);
    expect(Number(batch![1])).toBeLessThanOrEqual(20);
    expect(homePage).not.toContain('getHomeLatestAds()');
    expect(homePage).not.toContain('ProgressiveReveal');
  });
});

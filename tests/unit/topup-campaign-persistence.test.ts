import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const actions = readFileSync('src/app/admin/actions.ts', 'utf8');
const page = readFileSync('src/app/admin/revenue/page.tsx', 'utf8');

describe('top-up campaign design persistence', () => {
  const studio = readFileSync('src/components/admin/topup-banner-studio.tsx', 'utf8');

  it('submits the three presentation controls as real form fields', () => {
    expect(studio).toContain('name="bannerTemplate"');
    expect(studio).toContain('name="bannerWidth"');
    expect(studio).toContain('name="bannerHeight"');
    expect(studio).not.toContain('<input type="hidden" name="bannerTemplate"');
  });

  it('keeps the three selectors native so a re-render cannot reset them to the first option', () => {
    expect(studio).toContain('defaultValue="heritage"');
    expect(studio).toContain('defaultValue="full"');
    expect(studio).toContain('defaultValue="medium"');
    expect(studio).not.toContain('value={presentation.template}');
    expect(studio).not.toContain('value={presentation.width}');
    expect(studio).not.toContain('value={presentation.height}');
  });

  it('rejects a campaign if its selected template is not returned after saving', () => {
    expect(actions).toContain('check.some((c) => c.id === id && c.presentation.template === presentation.template)');
  });

  it('shows the saved template on each campaign record for administrator verification', () => {
    expect(page).toContain('قالب: {c.presentation.template}');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const actions = readFileSync('src/app/admin/actions.ts', 'utf8');
const page = readFileSync('src/app/admin/revenue/page.tsx', 'utf8');

describe('top-up campaign design persistence', () => {
  it('rejects a campaign if its selected template is not returned after saving', () => {
    expect(actions).toContain('check.some((c) => c.id === id && c.presentation.template === presentation.template)');
  });

  it('shows the saved template on each campaign record for administrator verification', () => {
    expect(page).toContain('قالب: {c.presentation.template}');
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('administration message inbox workflow', () => {
  it('sends the urgent banner to the actionable open inbox', () => {
    expect(read('src/components/admin-alerts-banner.tsx')).toContain("href: '/admin/messages?tab=open'");
  });

  it('exposes archive, reply, and archive-only permanent deletion controls', () => {
    const page = read('src/app/admin/messages/page.tsx');
    expect(page).toContain('أرشفة المحادثة');
    expect(page).toContain('الرد على العضو');
    expect(page).toContain('حذف المحادثة نهائياً');
    expect(page).toContain("tab === 'archived'");
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
describe('member account guide links', () => {
  it('offers direct account and administration paths', () => {
    expect(read('src/app/guide/page.tsx')).toContain("href: '/account/identities'");
    expect(read('src/app/guide/store/page.tsx')).toContain("href: '/account/identities'");
    expect(read('src/app/admin/guide/page.tsx')).toContain("href: '/admin/users'");
  });

  it('documents the separate seller and Trbhh customer-service contact controls', () => {
    expect(read('src/app/guide/page.tsx')).toContain('تواصل البائع مستقل تماماً عن خدمة عملاء تربح');
    expect(read('src/app/guide/store/page.tsx')).toContain('رقم خدمة عملاء تربح مستقل');
    expect(read('src/app/admin/guide/page.tsx')).toContain('واتساب البائع');
    expect(read('src/app/admin/guide/page.tsx')).toContain('رقم واتساب خدمة العملاء');
  });

  it('documents the admin-controlled personalized discovery feed', () => {
    expect(read('src/app/guide/page.tsx')).toContain('يمكن للإدارة إيقاف قسم «يهمّك الآن»');
    expect(read('src/app/admin/guide/page.tsx')).toContain('التوصيات المخصصة «يهمّك الآن»');
  });

  it('documents the server-side comparison feature switch', () => {
    expect(read('src/app/guide/page.tsx')).toContain('حتى أربعة إعلانات جنباً إلى جنب');
    expect(read('src/app/admin/guide/page.tsx')).toContain('مقارنة الإعلانات');
  });
});

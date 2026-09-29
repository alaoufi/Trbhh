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
    expect(read('src/app/guide/page.tsx')).toContain('قائمة الجوال السفلية');
  });

  it('documents the admin-controlled personalized discovery feed', () => {
    expect(read('src/app/guide/page.tsx')).toContain('يمكن للإدارة إيقاف قسم «يهمّك الآن»');
    expect(read('src/app/admin/guide/page.tsx')).toContain('التوصيات المخصصة «يهمّك الآن»');
  });

  it('documents the server-side comparison feature switch', () => {
    expect(read('src/app/guide/page.tsx')).toContain('حتى أربعة إعلانات جنباً إلى جنب');
    expect(read('src/app/admin/guide/page.tsx')).toContain('مقارنة الإعلانات');
  });

  it('documents requests-market visibility for members, stores and admins', () => {
    expect(read('src/app/guide/page.tsx')).toContain('سوق الطلبات يجمع إعلانات «طلب»');
    expect(read('src/app/guide/store/page.tsx')).toContain('تابع «سوق الطلبات»');
    expect(read('src/app/admin/guide/page.tsx')).toContain('رابط سوق الطلبات');
  });

  it('documents zero-result search recovery for members, stores and admins', () => {
    expect(read('src/app/guide/page.tsx')).toContain('نتائج قريبة بعد تخفيف الفلاتر');
    expect(read('src/app/guide/store/page.tsx')).toContain('نتائج قريبة بدل الصفحة الفارغة');
    expect(read('src/app/admin/guide/page.tsx')).toContain('استعادة نتائج البحث الصفرية');
  });

  it('documents admin-managed search synonyms', () => {
    expect(read('src/app/guide/page.tsx')).toContain('مرادفات البحث');
    expect(read('src/app/guide/store/page.tsx')).toContain('جوال وموبايل وهاتف');
    expect(read('src/app/admin/guide/page.tsx')).toContain('قاموس مرادفات البحث');
  });
});

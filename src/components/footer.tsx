import Link from 'next/link';
import { SITE } from '@/lib/constants';
import { DisclaimerBar } from '@/components/disclaimer';

export function Footer() {
  return (
    <footer className="mt-12 border-t bg-card">
      <div className="container py-10">
        <DisclaimerBar variant="full" className="mb-8" />
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">ت</span>
              <span className="text-lg font-bold">{SITE.name}</span>
            </div>
            <p className="text-sm text-muted-foreground">{SITE.tagline}</p>
          </div>
          <div>
            <h4 className="mb-3 font-semibold">روابط مهمة</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/" className="hover:text-primary">الرئيسية</Link></li>
              <li><Link href="/categories" className="hover:text-primary">الأقسام</Link></li>
              <li><Link href="/search" className="hover:text-primary">بحث متقدم</Link></li>
              <li><Link href="/pages/privacy" className="hover:text-primary">سياسة الخصوصية</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-semibold">الدعم</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/pages/about" className="hover:text-primary">من نحن</Link></li>
              <li><Link href="/pages/faq" className="hover:text-primary">الأسئلة الشائعة</Link></li>
              <li><Link href="/pages/terms" className="hover:text-primary">شروط الاستخدام</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-semibold">تواصل معنا</h4>
            <p className="text-sm text-muted-foreground" dir="ltr">{SITE.phone}</p>
          </div>
        </div>
        <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
          جميع الحقوق محفوظة {SITE.name} © 2026
        </div>
      </div>
    </footer>
  );
}

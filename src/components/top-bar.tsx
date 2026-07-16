import { Phone } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { getTickerNote } from '@/lib/settings';

// عدد نسخ النص المكرّرة داخل شريط الحركة — يضمن تغطية الشاشة بالكامل بلا
// فراغ حتى لو كان النص أقصر من عرضها (على الشاشات العريضة خصوصاً). يجب أن
// يطابق القيمة -100/TICKER_COPIES% في مؤشّرات الحركة بملف globals.css.
const TICKER_COPIES = 8;

export async function TopBar() {
  const note = await getTickerNote().catch(() => '');
  // وحدة متكرّرة — تُكرَّر عدة مرات (لا مرّتين فقط) حتى تبقى الشاشة مغطاة
  // بالنص طوال الحركة ولا تظهر فجوة فارغة بين دورة وأخرى.
  const Item = () => (
    <span className="inline-flex items-center gap-2 pe-16">
      <Phone className="h-3.5 w-3.5" />
      للاستفسار والملاحظات والاقتراحات
      <a href={`tel:${SITE.phone}`} dir="ltr" className="font-semibold underline-offset-2 hover:underline">{SITE.phone}</a>
      {note && <><span className="px-3 opacity-70">•</span>{note}</>}
    </span>
  );
  return (
    <div className="site-ticker bg-primary text-primary-foreground">
      <div className="marquee h-9 w-full text-xs leading-9 sm:text-sm">
        <div className="marquee-track">
          {Array.from({ length: TICKER_COPIES }).map((_, i) => <Item key={i} />)}
        </div>
      </div>
    </div>
  );
}

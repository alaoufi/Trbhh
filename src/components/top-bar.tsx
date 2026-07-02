import { Phone } from 'lucide-react';
import { SITE } from '@/lib/constants';

export function TopBar() {
  // one repeated unit, duplicated so the -50% loop is seamless
  const Item = () => (
    <span className="inline-flex items-center gap-2">
      <Phone className="h-3.5 w-3.5" />
      للاستفسار والملاحظات والاقتراحات
      <a href={`tel:${SITE.phone}`} dir="ltr" className="font-semibold underline-offset-2 hover:underline">{SITE.phone}</a>
      <span className="px-3 opacity-70">•</span>
      منصة تربح وسيلة عرض وربط فقط، والتعامل والدفع يتمّ خارج المنصة مباشرة بين الطرفين
    </span>
  );
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="marquee container h-9 text-xs leading-9 sm:text-sm">
        <div className="marquee-track">
          <Item />
          <Item />
        </div>
      </div>
    </div>
  );
}

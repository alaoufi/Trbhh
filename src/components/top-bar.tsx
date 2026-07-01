import { Phone } from 'lucide-react';
import { SITE } from '@/lib/constants';

export function TopBar() {
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="container flex h-9 items-center justify-center gap-2 text-xs sm:text-sm">
        <Phone className="h-3.5 w-3.5" />
        <span>للاستفسار والملاحظات والاقتراحات</span>
        <a href={`tel:${SITE.phone}`} dir="ltr" className="font-semibold underline-offset-2 hover:underline">
          {SITE.phone}
        </a>
      </div>
    </div>
  );
}

import { Home, LayoutGrid, MessageCircle, Store } from 'lucide-react';

/**
 * Fixed bottom navigation for the independent storefront (AliExpress-style):
 * jump to the site home, the store catalog, contact (WhatsApp), or — for the
 * owner — manage the store. Uses the store's brand color for the active item.
 */
export function StoreBottomNav({ brand, wa, isOwner }: { brand: string; wa: string | null; isOwner: boolean }) {
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold text-muted-foreground';
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl">
        <a href="/" className={item}><Home className="h-5 w-5" /> الرئيسية</a>
        <a href="#catalog" className={item} style={{ color: brand }}><LayoutGrid className="h-5 w-5" /> المنتجات</a>
        {wa
          ? <a href={wa} target="_blank" rel="noopener noreferrer" className={item}><MessageCircle className="h-5 w-5" /> تواصل</a>
          : <a href="#about" className={item}><MessageCircle className="h-5 w-5" /> نبذة</a>}
        {isOwner && <a href="/account/company" className={item}><Store className="h-5 w-5" /> إدارة</a>}
      </div>
    </nav>
  );
}

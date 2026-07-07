import Link from 'next/link';
import { Home, LayoutGrid, MessageCircle, Store, Plus } from 'lucide-react';
import { StoreContactLink } from '@/components/store-contact-link';

/**
 * Fixed bottom navigation for the independent storefront (AliExpress-style):
 * jump to the store's OWN home, the store catalog, contact (WhatsApp), or — for
 * the owner — manage the store. Uses the store's brand color for the active item.
 * The store is a fully independent site, so «الرئيسية» is the store landing —
 * NOT the main Trbhh site.
 */
export function StoreBottomNav({ brand, wa, isOwner, storeId, home, canAdd }: { brand: string; wa: string | null; isOwner: boolean; storeId: number; home: string; canAdd?: boolean }) {
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold text-muted-foreground';
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center">
        <Link href={home} className={item}><Home className="h-5 w-5" /> الرئيسية</Link>
        <a href="#catalog" className={item} style={{ color: brand }}><LayoutGrid className="h-5 w-5" /> الإعلانات</a>
        {/* زر إضافة إعلان بارز في منتصف القائمة (للمالك عند السماح بالنشر) */}
        {isOwner && canAdd && (
          <Link href="/ads/new?dest=store" aria-label="أضف إعلان" className="grid h-12 w-12 -translate-y-3 shrink-0 place-items-center rounded-full text-white shadow-lg" style={{ background: brand }}><Plus className="h-6 w-6" /></Link>
        )}
        {wa
          ? <StoreContactLink storeId={storeId} kind="whatsapp" href={wa} target="_blank" className={item}><MessageCircle className="h-5 w-5" /> تواصل</StoreContactLink>
          : <a href="#about" className={item}><MessageCircle className="h-5 w-5" /> نبذة</a>}
        {isOwner && <a href="/account/company" className={item}><Store className="h-5 w-5" /> إدارة</a>}
      </div>
    </nav>
  );
}

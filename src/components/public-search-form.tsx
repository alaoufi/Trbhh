import { SearchAreaPicker } from '@/components/search-area-picker';
import { SearchSuggestInput } from '@/components/search-suggest';
import { Search } from 'lucide-react';

type Region = { id: number; name: string; countryId?: number };
type Area = { id: number; name: string; cityId: number };

export function PublicSearchForm({ regions, areas, params = {}, priceOn = true, placeholder = 'ماذا تبحث عنه؟', compact = false }: {
  regions: Region[]; areas: Area[]; params?: Record<string, string | undefined>;
  priceOn?: boolean; placeholder?: string; compact?: boolean;
}) {
  const field = 'h-11 min-w-0 w-full rounded-lg border bg-background px-3 text-sm text-foreground';
  const filters = <>
    <SearchAreaPicker regions={regions} areas={areas} region={params.city || ''} area={params.area || ''} className={field} />
    <label className="space-y-1 text-xs font-semibold text-foreground">نوع الإعلان
      <select name="type" defaultValue={params.type || ''} className={field}>
        <option value="">عرض وطلب</option><option value="offer">عروض</option><option value="request">طلبات</option>
      </select>
    </label>
    {priceOn && <>
      <label className="space-y-1 text-xs font-semibold text-foreground">السعر من (ر.س)
        <input name="minPrice" type="number" min="0" max="2147483647" step="0.01" inputMode="decimal" defaultValue={params.minPrice || ''} className={field} placeholder="بدون حد أدنى" />
      </label>
      <label className="space-y-1 text-xs font-semibold text-foreground">السعر إلى (ر.س)
        <input name="maxPrice" type="number" min="0" max="2147483647" step="0.01" inputMode="decimal" defaultValue={params.maxPrice || ''} className={field} placeholder="بدون حد أعلى" />
      </label>
    </>}
    {!compact && <label className="space-y-1 text-xs font-semibold text-foreground">ترتيب النتائج
      <select name="sort" defaultValue={params.sort || 'newest'} className={field}>
        <option value="newest">الأحدث</option><option value="price_asc">السعر: من الأقل</option><option value="price_desc">السعر: من الأعلى</option>
      </select>
    </label>}
  </>;
  return <form action="/search" method="get" role="search" className="space-y-3">
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold text-foreground">البحث في الإعلانات
        <SearchSuggestInput key={params.q || ''} name="q" defaultValue={params.q || ''} placeholder={placeholder} />
      </label>
      <button type="submit" className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90"><Search className="h-4 w-4" /> بحث</button>
    </div>
    {params.special === '1' && <input name="special" type="hidden" value="1" />}
    {compact ? <details className="rounded-lg border bg-background px-3 py-2 text-foreground">
      <summary className="cursor-pointer text-sm font-semibold">المنطقة والمدينة · نوع الإعلان{priceOn ? ' · السعر' : ''}</summary>
      <div className="mt-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-3">{filters}</div>
    </details> : <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-3">{filters}</div>}
  </form>;
}

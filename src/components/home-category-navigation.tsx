import Link from 'next/link';
import { getCategoryFormConfig } from '@/lib/ad-categories/service';
import { searchAds } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';

/** Uses the same rollout switch and editable category labels as the ad form. */
export async function HomeCategoryNavigation({ selectedCategory }: { selectedCategory?: string | string[] }) {
  const config = await getCategoryFormConfig().catch(() => null);
  if (!config?.enabled) return null;
  const categories = config.categories.filter(category => category.active);
  if (!categories.length) return null;
  const { browse: browseLabel, clear: clearLabel, resultsTitle, emptyText } = config.labels;
  const selected = typeof selectedCategory === 'string' && /^[1-9]\d{0,14}$/.test(selectedCategory)
    ? categories.find(category => String(category.id) === selectedCategory) : undefined;
  const ads = selected ? await searchAds({ categoryId: selected.id, take: 24, skip: 0 }) : [];
  return <section data-testid="home-category-navigation" aria-label={config.labels.category} className="card-3d space-y-3 rounded-xl p-3">
    <form key={selected?.id.toString() || ''} action="/" method="get" className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 basis-full space-y-1 text-xs font-semibold text-foreground sm:flex-1 sm:basis-auto">{config.labels.category}
        <select name="category" defaultValue={selected?.id.toString() || ''} className="h-11 w-full rounded-lg border bg-background px-3 text-sm text-foreground">
          <option value="">{config.labels.choose}</option>
          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <button type="submit" className="min-h-11 max-w-full break-words rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">{browseLabel}</button>
      {selected && <Link href="/" className="max-w-full break-words px-2 py-3 text-xs text-primary underline">{clearLabel}</Link>}
    </form>
    {selected && <div className="space-y-3">
      <h2 className="break-words text-sm font-bold text-primary">{resultsTitle.replace(/\{(category|limit)\}/g, (_, key: string) => key === 'category' ? selected.name : '24')}</h2>
      {ads.length ? <AdGrid ads={ads} /> : <p className="break-words text-sm text-muted-foreground">{emptyText}</p>}
    </div>}
  </section>;
}

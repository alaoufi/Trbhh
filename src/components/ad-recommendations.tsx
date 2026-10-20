import type { AdCard } from '@/lib/data';
import { AdGrid } from './ad-card';
import styles from './home-dense-feed.module.css';

/** Keep detail recommendations as compact as the approved market homepage. */
export async function AdRecommendations({ sellerAds, similar }: { sellerAds: AdCard[]; similar: AdCard[] }) {
  if (!sellerAds.length && !similar.length) return null;
  return <div className={`${styles.catalog} ${styles.market} space-y-3`} data-ad-recommendations>
    {sellerAds.length > 0 && <section aria-label="إعلانات ذات صلة — لنفس المعلن">
      <h2 className="mb-2 text-base font-bold text-primary">إعلانات ذات صلة — لنفس المعلن</h2>
      <AdGrid ads={sellerAds} appearance="marketplace" />
    </section>}
    {similar.length > 0 && <section aria-label="إعلانات مشابهة">
      <h2 className="mb-2 text-base font-bold text-primary">إعلانات مشابهة</h2>
      <AdGrid ads={similar} appearance="marketplace" />
    </section>}
  </div>;
}

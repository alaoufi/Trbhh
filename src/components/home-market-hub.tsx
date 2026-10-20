'use client';

import { useEffect, useId, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Grid2X2, Store } from 'lucide-react';
import type { AdCard } from '@/lib/data';
import { adPriceLabel } from '@/lib/ad-presentation';
import styles from './home-market-hub.module.css';
import type { HomeOpportunityTile } from '@/lib/home-opportunities';

export interface HomeMarketHubProps {
  opportunities: HomeOpportunityTile[];
  ads: AdCard[];
  categories: { id: number; name: string }[];
  isLoggedIn: boolean;
  motion?: boolean;
}

export function HomeMarketHub({ opportunities, ads, categories, isLoggedIn, motion = true }: HomeMarketHubProps) {
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [hidden, setHidden] = useState(true);
  const pages = Math.ceil(ads.length / 4);
  const activePage = pages ? page % pages : 0;
  const picksId = useId();

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setHidden(document.hidden);
    updatePreference();
    updateVisibility();
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      preference.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!motion || reducedMotion || hidden || paused || hovered || focused || pages < 2) return;
    const timer = window.setInterval(() => setPage(current => (current + 1) % pages), 6000);
    return () => window.clearInterval(timer);
  }, [motion, reducedMotion, hidden, paused, hovered, focused, pages]);

  const distinctOpportunities = opportunities.filter((item, index, all) => all.findIndex(other => other.href === item.href) === index).slice(0, 4);
  const move = (step: number) => setPage((activePage + step + pages) % pages);

  return <section className={styles.root} dir="rtl" aria-label="اكتشف السوق">
    <div className={styles.band}>
      <div><h2>فرص لعملك.. تبدأ من تربح</h2><p>اكتشف الأقسام، قارن الخيارات، وتواصل مباشرة.</p></div>
      <nav className={styles.tiles} aria-label="فرص من إعلانات السوق" style={{gridTemplateColumns:`repeat(${Math.max(1,distinctOpportunities.length)},minmax(0,1fr))`}}>
        {distinctOpportunities.map(item => <Link key={item.href} href={item.href}>
          <span className={styles.tileImage}>{item.image ? <Image src={item.image} alt="" fill sizes="64px" className={styles.image} /> : <Grid2X2 aria-hidden="true" size={24} />}</span><span className={styles.tileText}>{item.title ? <><strong>{item.title}</strong><small>{item.featured && <b>مميّز · </b>}{item.categoryName}</small></> : item.categoryName}</span>
        </Link>)}
        {!distinctOpportunities.length && <Link href="/ads/new">ابدأ بإعلانك في تربح</Link>}
      </nav>
    </div>
    <div className={styles.hub}>
      <nav className={styles.categories} aria-label="أقسام تهمك"><h3>تصفّح حسب احتياجك</h3>
        {categories.slice(0, 5).map(category => <Link key={category.id} href={`/search?category=${category.id}`}><span>{category.name}</span><ChevronLeft size={14} aria-hidden="true" /></Link>)}
        <Link href="/search">كل الإعلانات<ArrowLeft size={14} aria-hidden="true" /></Link>
      </nav>
      <section className={styles.market} aria-label="مختارات من السوق" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div className={styles.heading}><h3>مختارات من السوق</h3>{pages > 1 && <div className={styles.controls}>
          <button type="button" onClick={() => move(-1)} aria-label="المجموعة السابقة" aria-controls={picksId}><ChevronRight size={15} /></button>
          <button type="button" onClick={() => move(1)} aria-label="المجموعة التالية" aria-controls={picksId}><ChevronLeft size={15} /></button>
          {motion && !reducedMotion && <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'تشغيل' : 'إيقاف'}</button>}
        </div>}</div>
        {ads.length ? <div id={picksId} className={styles.picks}>
          {ads.slice(activePage * 4, activePage * 4 + 4).map(ad => <Link key={ad.id} href={ad.href ?? `/ads/${ad.id}`} className={styles.pick}>
            <span className={styles.adImage}><Image src={ad.image} alt="" fill sizes="64px" className={styles.image} /></span>
            <span className={styles.adText}><strong>{ad.title}</strong><small>{adPriceLabel(ad)}</small></span>
          </Link>)}
        </div> : <div className={styles.empty}><Store size={26} aria-hidden="true" /><p>اكتشف ما يناسب احتياجك في السوق.</p><Link href="/search">تصفّح الإعلانات <ArrowLeft size={14} aria-hidden="true" /></Link></div>}
        <div className={styles.foot}>{pages > 0 && <span aria-live={focused || paused ? 'polite' : 'off'}>المجموعة {activePage + 1} من {pages}</span>}<Link href="/search">استكشف كل الإعلانات ←</Link></div>
      </section>
      <section className={styles.business}><h3>مساحة لأعمالك</h3><p>اعرض ما تقدّمه، وابحث عمّا تحتاجه.</p>
        <nav className={styles.options} aria-label="خيارات أعمالك"><Link href="/search">اكتشف</Link><Link href="/companies">المتاجر</Link><Link href="/ads/new">انشر إعلانك</Link></nav>
        <Link className={styles.account} href={isLoggedIn ? '/account' : '/login'}>{isLoggedIn ? 'حسابك' : 'الدخول لحسابك'}</Link><small>خيارات واضحة وتواصل مباشر مع المعلن.</small>
      </section>
    </div>
  </section>;
}

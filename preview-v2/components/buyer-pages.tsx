'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Bell, Check, ChevronLeft, Clock3, Copy, Flag, ImageIcon, MapPin, Maximize2, MessageCircle, Phone, Search, ShieldCheck, SlidersHorizontal, Star, Store, X } from 'lucide-react';
import { listings, stores } from '../lib/demo-data';
import { notify, readLocal, writeLocal } from '../lib/preview';
import { FavoriteButton, ListingCard, Price, PreviewAction, SectionHeading } from './ui';
import './buyer.css';

const storeSlugs = ['dar', 'tech', 'equipment'];
const storeDescriptions = [
  'قطع عملية ومساحات تشبهك. نموذج لمتجر يعرض أثاث المنزل والمكتب، مع تفاصيل واضحة تساعدك على اختيار القطعة المناسبة والتواصل مع صاحبها.',
  'تقنية تناسب يومك. نموذج لمتجر متخصص في الأجهزة والإلكترونيات، يتيح لك استعراض المواصفات ومقارنة الخيارات قبل التواصل مع البائع.',
  'معدات لأعمالك القادمة. نموذج لمتجر متخصص في الآليات ومعدات المشاريع، مع مساحة لعرض المواصفات وتنسيق المعاينة مع صاحب الإعلان.',
];

function Modal({ title, children, onClose, large = false }: { title: string; children: ReactNode; onClose: () => void; large?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; returnFocus.current?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`buyer-dialog${large ? ' buyer-dialog-large' : ''}`} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="buyer-dialog-inner">
      <div className="buyer-dialog-heading"><h2>{title}</h2><button className="buyer-icon-button" onClick={onClose} aria-label="إغلاق النافذة"><X size={21} /></button></div>
      {children}
    </div>
  </dialog>;
}

function Verification({ business, verified = true }: { business: boolean; verified?: boolean }) {
  if (!verified) return <span className="buyer-unverified">التوثيق غير معروض في هذا المثال</span>;
  return <span className="buyer-verified"><BadgeCheck size={17} />{business ? 'توثيق منشأة · مثال' : 'توثيق هوية · مثال'}</span>;
}

function ContactActions({ mobile = false }: { mobile?: boolean }) {
  return <div className={mobile ? 'buyer-mobile-contact' : 'buyer-contact-actions'}>
    <PreviewAction className="button primary" title="معاينة مراسلة البائع"><MessageCircle size={19} />راسل البائع</PreviewAction>
    <PreviewAction className="button secondary" title="معاينة التواصل عبر واتساب"><MessageCircle size={18} />واتساب</PreviewAction>
    <PreviewAction className="button secondary" title="معاينة الاتصال بالبائع"><Phone size={18} />اتصال</PreviewAction>
  </div>;
}

function ReportForm({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  if (submitted) return <div className="buyer-report-success"><span><Check size={28} /></span><h3>تم حفظ البلاغ في المعاينة</h3><p>هذا بلاغ تجريبي محفوظ على جهازك فقط. لم يُرسل إلى فريق دعم أو صاحب إعلان.</p><button className="button primary" onClick={onClose}>العودة للإعلان</button></div>;
  return <form className="buyer-report-form" onSubmit={(event) => {
    event.preventDefault();
    if (!reason) return;
    const saved = readLocal<Array<{ listingId: string; reason: string; details: string; createdAt: string }>>('reports', []);
    writeLocal('reports', [...saved, { listingId, reason, details: details.trim(), createdAt: new Date().toISOString() }]);
    setSubmitted(true);
  }}>
    <p className="muted">ساعدنا على توضيح تجربة الإبلاغ. جميع المدخلات هنا تجريبية وتبقى على جهازك.</p>
    <label htmlFor="buyer-report-reason">سبب البلاغ</label>
    <select id="buyer-report-reason" value={reason} onChange={(event) => setReason(event.target.value)} required><option value="">اختر السبب</option><option>معلومات غير صحيحة</option><option>إعلان مكرر</option><option>محتوى غير مناسب</option><option>اشتباه في احتيال</option><option>سبب آخر</option></select>
    <label htmlFor="buyer-report-details">تفاصيل إضافية <span className="muted">(اختياري)</span></label>
    <textarea id="buyer-report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={600} rows={4} placeholder="اكتب ما لاحظته دون بيانات شخصية…" />
    <div className="buyer-report-footer"><span className="muted">{details.length} / 600</span><button type="submit" className="button primary">حفظ بلاغ تجريبي</button></div>
  </form>;
}

export function ListingPage({ listingId }: { listingId: string }) {
  const listing = listings.find((item) => item.id === listingId);
  const [activeImage, setActiveImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  if (!listing) return <div className="container buyer-empty-page"><h1>الإعلان غير موجود في المعاينة</h1><Link href="/search/" className="button primary">تصفح الإعلانات</Link></div>;
  const businessIndex = stores.findIndex((store) => store.name === listing.seller);
  const related = [...listings.filter((item) => item.id !== listing.id && item.category === listing.category), ...listings.filter((item) => item.id !== listing.id && item.category !== listing.category)].slice(0, 4);
  const shareListing = async () => {
    try { await navigator.clipboard.writeText(window.location.href); notify('تم نسخ رابط الإعلان التجريبي.'); }
    catch { notify('تعذر نسخ الرابط تلقائيًا. يمكنك نسخه من شريط عنوان المتصفح.'); }
  };
  return <div className="buyer-page buyer-listing-page">
    <div className="container">
      <nav className="buyer-breadcrumbs" aria-label="مسار التنقل"><Link href="/">الرئيسية</Link><ChevronLeft size={14} /><Link href={`/search/?category=${encodeURIComponent(listing.category)}`}>{listing.category}</Link><ChevronLeft size={14} /><span>{listing.title}</span></nav>
      <div className="buyer-listing-layout">
        <div className="buyer-listing-main">
          <section className="buyer-gallery" aria-label="صور الإعلان">
            <button className="buyer-main-image" onClick={() => setGalleryOpen(true)} aria-label={`تكبير صورة ${listing.title}`}><img src={listing.images[activeImage]} alt={listing.title} fetchPriority="high" /><span className="buyer-enlarge"><Maximize2 size={17} />تكبير الصورة</span><span className="buyer-image-count"><ImageIcon size={16} />{activeImage + 1} / {listing.images.length}</span></button>
            <div className="buyer-gallery-strip"><div className="buyer-thumbnails">{listing.images.map((src, index) => <button key={`${src}-${index}`} onClick={() => setActiveImage(index)} className={activeImage === index ? 'active' : ''} aria-label={`عرض الصورة ${index + 1}`} aria-pressed={activeImage === index}><img src={src} alt="" /></button>)}</div><p>صور توضيحية للإعلان التجريبي</p></div>
          </section>
          <section className="buyer-info-card">
            <div className="buyer-title-toolbar"><div className="buyer-listing-badges"><span className="badge">{listing.condition}</span>{listing.featured && <span className="buyer-gold-badge"><Star size={13} />مميز · معاينة</span>}</div><div className="buyer-toolbar-actions"><FavoriteButton id={listing.id} /><button className="buyer-icon-button" onClick={shareListing} aria-label="نسخ رابط الإعلان"><Copy size={18} /></button></div></div>
            <h1>{listing.title}</h1>
            <div className="buyer-listing-meta"><span><MapPin size={16} />{listing.city}</span><span><Clock3 size={16} />{listing.time} · وقت توضيحي</span><span>رقم الإعلان <bdi>#{listing.id}</bdi></span></div>
            <div className="buyer-price"><Price value={listing.price} /><span>سعر توضيحي</span></div>
            <div className="buyer-description"><h2>تفاصيل تستحق تعرفها</h2><p>{listing.description}</p></div>
            <h2 className="buyer-specs-heading">المواصفات</h2>
            <dl className="buyer-specs">{listing.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className="buyer-info-footer"><span>آخر تحديث: {listing.time} · مثال</span><button onClick={() => setReportOpen(true)}><Flag size={15} />الإبلاغ عن الإعلان</button></div>
          </section>
          <section className="buyer-safety"><ShieldCheck size={26} /><div><h2>خذ وقتك، وتأكد قبل الاتفاق</h2><p>عاين السلعة وتحقق من تفاصيلها قبل الدفع. شارة التوثيق تعرّف بنوع التحقق ولا تضمن جودة السلعة أو إتمام الصفقة.</p></div></section>
        </div>
        <aside className="buyer-seller-column" aria-label="صاحب الإعلان">
          <section className="buyer-seller-card">
            <div className="buyer-seller-topline"><span className="eyebrow">صاحب الإعلان</span><span className="buyer-account-type">{businessIndex >= 0 ? 'متجر' : 'فرد'}</span></div>
            <div className="buyer-seller-avatar" aria-hidden="true">{listing.seller.slice(0, 1)}</div>
            <h2>{listing.seller}</h2>
            <Verification business={businessIndex >= 0} verified={listing.verified} />
            <div className="buyer-seller-location"><MapPin size={15} />{listing.city}</div>
            <div className="buyer-seller-facts"><div><span>نوع العضوية</span><strong>{businessIndex >= 0 ? 'متجر تجريبي' : 'عضو تجريبي'}</strong></div><div><span>الإعلانات في المعاينة</span><strong>{listings.filter((item) => item.seller === listing.seller).length} إعلان</strong></div></div>
            <ContactActions />
            <p className="buyer-contact-note">تجربة تواصل توضيحية؛ لا تُرسل رسائل فعلية.</p>
            {businessIndex >= 0 && <Link href={`/store/${storeSlugs[businessIndex]}/`} className="buyer-visit-store"><Store size={17} />زيارة المتجر<ArrowLeft size={17} /></Link>}
          </section>
          <div className="buyer-help-card"><ShieldCheck size={20} /><div><strong>معنى التوثيق واضح</strong><p>الهوية للأفراد وسجل المنشأة للمتاجر. جميع الشارات في هذه النسخة أمثلة عرض.</p></div></div>
        </aside>
      </div>
      <section className="section buyer-related"><SectionHeading title="قد يناسبك أيضًا" subtitle="خيارات أخرى من إعلانات المعاينة" href={`/search/?category=${encodeURIComponent(listing.category)}`} linkText="تصفح القسم" /><div className="buyer-related-grid">{related.map((item) => <ListingCard key={item.id} listing={item} />)}</div></section>
    </div>
    <ContactActions mobile />
    {galleryOpen && <Modal title="صور الإعلان" onClose={() => setGalleryOpen(false)} large><img className="buyer-dialog-image" src={listing.images[activeImage]} alt={listing.title} /><p className="buyer-gallery-caption">{listing.title} · الصورة {activeImage + 1} من {listing.images.length}</p></Modal>}
    {reportOpen && <Modal title="الإبلاغ عن الإعلان" onClose={() => setReportOpen(false)}><ReportForm listingId={listing.id} onClose={() => setReportOpen(false)} /></Modal>}
  </div>;
}

const demoReviews = [
  { name: 'عميل تجريبي 01', initial: 'ع', rating: 5, text: 'المواصفات واضحة والصور تساعد في معرفة تفاصيل المنتج قبل التواصل.', date: 'تقييم توضيحي' },
  { name: 'عميل تجريبي 02', initial: 'ع', rating: 4, text: 'التصفح سهل، وأعجبتني طريقة تنظيم إعلانات المتجر وتوضيح نوع التوثيق.', date: 'تقييم توضيحي' },
];

export function StorePage({ storeSlug }: { storeSlug: string }) {
  const storeIndex = storeSlugs.indexOf(storeSlug);
  const store = stores[storeIndex];
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState<'ads' | 'about' | 'reviews'>('ads');
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState('الكل');
  const [sort, setSort] = useState('newest');
  useEffect(() => { setFollowing(readLocal<string[]>('following-stores', []).includes(storeSlug)); }, [storeSlug]);
  if (!store) return <div className="container buyer-empty-page"><h1>المتجر غير موجود في المعاينة</h1><Link className="button primary" href="/#stores">تصفح المتاجر</Link></div>;
  const catalog = listings.filter((listing) => listing.seller === store.name);
  const filtered = catalog.filter((listing) => (!query.trim() || `${listing.title} ${listing.description}`.includes(query.trim())) && (condition === 'الكل' || listing.condition === condition)).sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : Number(b.id) - Number(a.id));
  const toggleFollow = () => {
    const followed = readLocal<string[]>('following-stores', []);
    writeLocal('following-stores', following ? followed.filter((slug) => slug !== storeSlug) : [...new Set([...followed, storeSlug])]);
    setFollowing(!following);
    notify(following ? 'تم إلغاء متابعة المتجر على هذا الجهاز.' : 'تمت متابعة المتجر على هذا الجهاز. لا تُرسل إشعارات فعلية في المعاينة.');
  };
  return <div className="buyer-page buyer-store-page">
    <div className="container"><nav className="buyer-breadcrumbs" aria-label="مسار التنقل"><Link href="/">الرئيسية</Link><ChevronLeft size={14} /><Link href="/#stores">المتاجر</Link><ChevronLeft size={14} /><span>{store.name}</span></nav>
      <section className="buyer-store-header">
        <div className={`buyer-store-cover buyer-cover-${storeSlug}`}><img src={store.image} alt={`صورة توضيحية لتخصص ${store.name}`} /><div className="buyer-store-cover-copy"><span>مساحة للخيارات الجيدة</span><p>{storeSlug === 'dar' ? 'كل قطعة، لها مكان.' : storeSlug === 'tech' ? 'تقنية تقرّب لك كل شيء.' : 'جاهز لمشروعك القادم.'}</p></div><span className="buyer-cover-label">واجهة متجر تجريبية</span></div>
        <div className="buyer-store-profile"><div className="buyer-store-identity"><span className="buyer-store-logo" style={{ backgroundColor: store.color }}>{store.initial}</span><div><div className="buyer-store-name"><h1>{store.name}</h1><Verification business /></div><p><MapPin size={16} />{store.city}<span>·</span>{store.category}</p></div></div><div className="buyer-store-profile-actions"><button className={`button ${following ? 'secondary' : 'primary'}`} onClick={toggleFollow} aria-pressed={following}>{following ? <Check size={18} /> : <Bell size={18} />}{following ? 'تتابع المتجر' : 'متابعة المتجر'}</button><PreviewAction className="button secondary" title="معاينة مراسلة المتجر"><MessageCircle size={18} />مراسلة</PreviewAction></div></div>
        <div className="buyer-store-bottom"><p>{storeDescriptions[storeIndex].split('. ')[0]}.</p><div className="buyer-store-stat"><span><b>{catalog.length}</b> إعلان تجريبي</span><span><Star size={15} fill="currentColor" /><b>4.5</b> من تقييمين توضيحيين</span></div></div>
      </section>
      <div className="buyer-store-layout">
        <div className="buyer-store-content">
          <div className="buyer-tabs" role="tablist" aria-label="أقسام المتجر">{([{ id: 'ads', label: 'الإعلانات', count: catalog.length }, { id: 'about', label: 'عن المتجر' }, { id: 'reviews', label: 'التقييمات', count: 2 }] as const).map((item, index) => <button key={item.id} id={`store-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`store-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const ids = ['ads', 'about', 'reviews'] as const; const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowLeft' ? 1 : -1) + 3) % 3; setTab(ids[next]); document.getElementById(`store-tab-${ids[next]}`)?.focus(); } }}>{item.label}{'count' in item && <span>{item.count}</span>}</button>)}</div>
          <section className="buyer-store-panel" role="tabpanel" id={`store-panel-${tab}`} aria-labelledby={`store-tab-${tab}`}>
            {tab === 'ads' && <><div className="buyer-catalog-heading"><div><h2>إعلانات المتجر</h2><p>استعرض المتاح وابحث عن اللي يناسبك</p></div><span className="buyer-catalog-count">{filtered.length} نتيجة</span></div><div className="buyer-catalog-filters"><div className="buyer-catalog-search"><Search size={19} /><input aria-label="البحث في إعلانات المتجر" placeholder="ابحث في إعلانات المتجر…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="مسح البحث" onClick={() => setQuery('')}><X size={15} /></button>}</div><label className="buyer-select-wrap"><SlidersHorizontal size={17} /><select aria-label="حالة السلعة" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="الكل">كل الحالات</option><option>جديد</option><option>مستعمل</option></select></label><select className="buyer-sort-select" aria-label="ترتيب إعلانات المتجر" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">الأحدث</option><option value="low">السعر: الأقل أولًا</option><option value="high">السعر: الأعلى أولًا</option></select></div>{filtered.length ? <div className="buyer-catalog-grid">{filtered.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div> : <div className="buyer-catalog-empty"><Search size={30} /><h3>ما لقينا إعلان يطابق بحثك</h3><p>جرّب كلمة أخرى أو اعرض جميع حالات السلع.</p><button className="button secondary" onClick={() => { setQuery(''); setCondition('الكل'); }}>مسح الفلاتر</button></div>}<div className="buyer-catalog-note"><Store size={19} /><p>كتالوج مختصر لعرض تجربة المتجر. جميع الإعلانات والبيانات هنا توضيحية.</p></div></>}
            {tab === 'about' && <div className="buyer-store-about"><span className="eyebrow">تعرّف على المتجر</span><h2>{store.name}</h2><p>{storeDescriptions[storeIndex]}</p><dl className="buyer-specs"><div><dt>التخصص</dt><dd>{store.category}</dd></div><div><dt>المدينة</dt><dd>{store.city}</dd></div><div><dt>نوع الحساب</dt><dd>منشأة · مثال توضيحي</dd></div><div><dt>العضوية</dt><dd>متجر تجريبي</dd></div></dl><div className="buyer-about-note"><ShieldCheck size={23} /><div><h3>شفافية في بيانات المتجر</h3><p>الاسم والصور ونوع التوثيق أمثلة لشرح التصميم. لا تمثل هذه الصفحة منشأة موثقة فعليًا، ولا تتوفر معاملات شراء في المعاينة.</p></div></div></div>}
            {tab === 'reviews' && <div className="buyer-reviews"><div className="buyer-review-summary"><div><span className="eyebrow">كيف تظهر التقييمات</span><h2>آراء العملاء</h2><p>أمثلة مكتوبة لمراجعة الواجهة؛ ليست تجارب شراء فعلية.</p></div><div className="buyer-review-score"><strong>4.5<span>/ 5</span></strong><div aria-label="4.5 من 5 نجوم">{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={15} fill={value <= 4 ? 'currentColor' : 'none'} />)}</div><span>تقييمان توضيحيان</span></div></div>{demoReviews.map((review) => <article className="buyer-review" key={review.name}><div className="buyer-review-author"><span>{review.initial}</span><div><h3>{review.name}</h3><p>{review.date}</p></div><div className="buyer-review-stars" aria-label={`${review.rating} من 5 نجوم`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={14} fill={value <= review.rating ? 'currentColor' : 'none'} />)}</div></div><p>{review.text}</p></article>)}</div>}
          </section>
        </div>
        <aside className="buyer-store-sidebar"><div className="buyer-store-details-card"><span className="buyer-side-icon"><Store size={23} /></span><h2>تفاصيل المتجر</h2><dl><div><dt>الموقع</dt><dd><MapPin size={15} />{store.city}</dd></div><div><dt>القسم</dt><dd><Link href={`/search/?category=${encodeURIComponent(store.category)}`}>{store.category}<ChevronLeft size={14} /></Link></dd></div><div><dt>العضوية</dt><dd>متجر تجريبي</dd></div><div><dt>التوثيق</dt><dd><Verification business /></dd></div></dl><p>متابعة المتجر تُحفظ محليًا لتجربة الواجهة.</p></div><div className="buyer-store-discover"><span className="eyebrow">خيارات أكثر، في مكان واحد</span><h3>خلّ بحثك يوصل أبعد</h3><p>اكتشف إعلانات من نفس القسم، وقارن بين الخيارات المتاحة.</p><Link href={`/search/?category=${encodeURIComponent(store.category)}`}>تصفح {store.category}<ArrowLeft size={17} /></Link></div></aside>
      </div>
    </div>
  </div>;
}

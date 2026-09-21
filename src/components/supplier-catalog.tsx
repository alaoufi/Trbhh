'use client';

import {useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode} from 'react';
import Image from 'next/image';
import {Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, ImageOff, Loader2, Package, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Store, Trash2, X} from 'lucide-react';
import {formatSar} from '@/lib/commerce/money';
import {CATALOG_SELECTION_LIMIT, type CatalogActions, type CatalogDetail, type CatalogPage, type CatalogProduct, type CatalogReview, type CatalogSearch} from '@/lib/suppliers/catalog-selection';
import {catalogPriceDrafts, catalogPriceErrors, catalogSelections, changeCatalogSelection, normalizeCatalogPrice, type PriceDrafts} from './supplier-catalog-state';

const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#16294a] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#233d65] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b97d16] disabled:cursor-not-allowed disabled:opacity-45';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#16294a] transition hover:border-amber-400 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b97d16] disabled:cursor-not-allowed disabled:opacity-45';
const input = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#b97d16] focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100';
const stock = (product: Pick<CatalogProduct, 'quantity' | 'available'>) => !product.available ? 'غير متوفر' : product.quantity === null ? 'الكمية غير محددة' : `${product.quantity.toLocaleString('ar-SA')} وحدة`;
const timestamp = (value: string | null) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'غير متاح';
  return new Intl.DateTimeFormat('ar-SA', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh'}).format(new Date(value));
};
const statusStyle: Record<CatalogProduct['status'], string> = {
  imported: 'border-sky-100 bg-sky-50 text-sky-800', added_hidden: 'border-amber-200 bg-amber-50 text-amber-900',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-800', unavailable: 'border-slate-200 bg-slate-100 text-slate-600', disconnected: 'border-rose-200 bg-rose-50 text-rose-800',
};

function ProductImage({src, name, sizes = '(max-width: 640px) 100vw, 300px'}: {src: string | null; name: string; sizes?: string}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && failedSource !== src
    ? <Image src={src} alt={name} fill unoptimized sizes={sizes} referrerPolicy="no-referrer" className="object-contain p-3" onError={() => setFailedSource(src)}/>
    : <div className="flex h-full min-h-20 flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400"><ImageOff aria-hidden="true" className="h-9 w-9"/><span className="text-xs">لا توجد صورة متاحة</span></div>;
}
function Price({minor}: {minor: number}) {return <span className="whitespace-nowrap"><bdi>{formatSar(minor)}</bdi> <span className="text-xs font-medium">ر.س</span></span>;}
function Status({product}: {product: CatalogProduct}) {return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyle[product.status]}`}>{product.statusLabel}</span>;}
function Spinner({label}: {label: string}) {return <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-4 text-slate-600"><Loader2 className="h-7 w-7 animate-spin text-[#b97d16]" aria-hidden="true"/>{label}</div>;}

function CatalogDialog({title, children, onClose, saving, returnFocus, fallbackFocus}: {title: string; children: ReactNode; onClose: () => void; saving: boolean; returnFocus: HTMLElement | null; fallbackFocus: HTMLElement | null}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal(); // Native modal semantics trap keyboard focus and make the background inert.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected && !('disabled' in returnFocus && returnFocus.disabled)) returnFocus.focus();
      else if (fallbackFocus?.isConnected) fallbackFocus.focus();
    };
  }, [returnFocus, fallbackFocus]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true" dir="rtl" className="m-auto max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-4xl overflow-y-auto rounded-2xl bg-[#fafaf8] p-0 text-[#16294a] shadow-2xl backdrop:bg-slate-950/60 sm:w-[calc(100%_-_3rem)]" onCancel={event => {event.preventDefault(); if (!saving) onClose();}} onClick={event => {if (event.target === event.currentTarget && !saving) onClose();}}>
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6"><h2 id={titleId} className="text-lg font-extrabold">{title}</h2><button type="button" onClick={onClose} disabled={saving} aria-label="إغلاق النافذة" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"><X aria-hidden="true" className="h-5 w-5"/></button></div>
      {children}
    </div>
  </dialog>;
}

function DetailContent({product, onAdd}: {product: CatalogDetail; onAdd: () => void}) {
  const images = [...new Set([product.image, ...product.images].filter((image): image is string => Boolean(image)))];
  const [activeImage, setActiveImage] = useState(0);
  return <div className="space-y-6 p-4 sm:p-6">
    <div className="grid gap-6 md:grid-cols-2">
      <div><div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white"><ProductImage src={images[activeImage] || null} name={product.name} sizes="(max-width: 768px) 90vw, 400px"/></div>{images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="صور المنتج">{images.map((image, index) => <button key={image} type="button" onClick={() => setActiveImage(index)} aria-label={`عرض الصورة ${index + 1}`} aria-pressed={activeImage === index} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${activeImage === index ? 'border-[#b97d16]' : 'border-slate-200'}`}><ProductImage src={image} name={`${product.name} — الصورة ${index + 1}`} sizes="64px"/></button>)}</div>}</div>
      <div className="space-y-4"><Status product={product}/><h3 className="break-words text-2xl font-extrabold leading-relaxed">{product.name}</h3><p className="flex items-center gap-2 text-sm text-slate-600"><Store aria-hidden="true" className="h-4 w-4"/>{product.supplierName}</p><div className="rounded-2xl bg-white p-4"><p className="text-xs text-slate-500">سعر المنتج في سلة</p><p className="mt-1 text-2xl font-extrabold"><Price minor={product.priceMinor}/></p><p className="mt-2 text-sm">المخزون: {stock(product)}</p></div>
      <dl className="space-y-3 text-sm">{product.sku && <div><dt className="text-xs text-slate-500">رمز المنتج SKU</dt><dd className="mt-1 break-all"><bdi>{product.sku}</bdi></dd></div>}{product.brand && <div><dt className="text-xs text-slate-500">العلامة التجارية</dt><dd className="mt-1">{product.brand}</dd></div>}<div><dt className="text-xs text-slate-500">آخر مزامنة مع سلة</dt><dd className="mt-1">{timestamp(product.lastSyncAt)}</dd></div><div><dt className="text-xs text-slate-500">آخر تحديث لدى المورد</dt><dd className="mt-1">{timestamp(product.sourceUpdatedAt)}</dd></div></dl>
      <button type="button" className={`${primary} w-full`} disabled={!product.canSelect} onClick={onAdd}><Plus aria-hidden="true" className="h-4 w-4"/>إضافة إلى تربح</button><p className="text-xs leading-6 text-slate-500">تظهر مراجعة الأسعار قبل الإضافة. المنتج يبقى مخفيًا وغير نشط.</p></div>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-bold">وصف المنتج</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-8 text-slate-600">{product.description || 'لا يوجد وصف لهذا المنتج.'}</p></section>
    {!!product.categories.length && <section><h3 className="mb-3 font-bold">التصنيفات</h3><div className="flex flex-wrap gap-2">{product.categories.map((category, index) => <span key={`${category}-${index}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm">{category}</span>)}</div></section>}
    {!!product.options.length && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-bold">خيارات المنتج</h3><dl className="mt-3 space-y-3">{product.options.map((option, index) => <div key={`${option.name}-${index}`}><dt className="text-sm font-semibold">{option.name}</dt><dd className="mt-1 text-sm leading-7 text-slate-600">{option.values.join('، ') || 'لا توجد قيم مسجلة'}</dd></div>)}</dl></section>}
    {!!product.variants.length && <section><h3 className="mb-3 font-bold">الأصناف المتاحة</h3><div className="grid gap-3 sm:grid-cols-2">{product.variants.map((variant, index) => <article key={index} className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4"><h4 className="font-semibold">{variant.name || 'صنف من المنتج'}</h4>{variant.sku && <p className="break-all text-xs text-slate-500">SKU: <bdi>{variant.sku}</bdi></p>}{Object.entries(variant.options).map(([name, value]) => <p key={name} className="text-sm">{name}: {value}</p>)}<p className="font-bold">{variant.priceMinor === null ? 'السعر غير محدد' : <Price minor={variant.priceMinor}/>}</p><p className="text-sm text-slate-600">{stock(variant)}</p></article>)}</div></section>}
    {product.hasOptions && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">لهذا المنتج خيارات أو أصناف متعددة. يبقى غير نشط بعد الإضافة، حتى تتم مراجعة ربط الخيارات والمخزون.</p>}
  </div>;
}

export function SupplierCatalog({initialData, actions, exampleState = false}: {initialData: CatalogPage; actions: CatalogActions; exampleState?: boolean}) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState(initialData.query);
  const [supplier, setSupplier] = useState(initialData.supplierKey);
  const [selected, setSelected] = useState<CatalogProduct[]>([]);
  const [panel, setPanel] = useState<'preview' | 'review' | 'manage' | null>(null);
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [managed, setManaged] = useState<CatalogProduct | null>(null);
  const [saleMode, setSaleMode] = useState<'source' | 'manual'>('source');
  const [saleValue, setSaleValue] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [review, setReview] = useState<CatalogReview | null>(null);
  const [drafts, setDrafts] = useState<PriceDrafts>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'search' | 'details' | 'review' | 'approve' | 'update' | 'hide' | 'remove' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const operation = useRef(0);
  const lock = useRef<typeof busy>(null);
  const alive = useRef(true);
  const opener = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const queryId = useId(), supplierId = useId();
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const begin = (kind: NonNullable<typeof busy>) => {if (lock.current) return null; lock.current = kind; setBusy(kind); return ++operation.current;};
  const current = (id: number) => alive.current && operation.current === id;
  const finish = (id: number) => {if (current(id)) {lock.current = null; setBusy(null);}};
  const close = useCallback(() => {if (lock.current && ['approve','update','hide','remove'].includes(lock.current)) return; operation.current++; lock.current = null; setBusy(null); setPanel(null); setModalError('');}, []);
  const captureFocus = () => {if (!panel) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : heading.current;};

  async function search(input: CatalogSearch) {
    if (panel) return;
    const id = begin('search'); if (id === null) return;
    setError('');
    try {const result = await actions.search(input); if (!current(id)) return; if (!result.data || result.error) setError(result.error || 'تعذر تحميل المنتجات. أعد المحاولة.'); else {setData(result.data); setQuery(result.data.query); setSupplier(result.data.supplierKey);}}
    catch {if (current(id)) setError('تعذر الاتصال. لم يتغير اختيارك؛ حاول تحميل المنتجات مرة أخرى.');}
    finally {finish(id);}
  }
  async function preview(product: CatalogProduct) {
    const id = begin('details'); if (id === null) return;
    captureFocus(); setDetail(null); setModalError(''); setPanel('preview');
    try {const result = await actions.details(product.key); if (!current(id)) return; if (!result.product || result.error) setModalError(result.error || 'تعذر تحميل معاينة المنتج.'); else setDetail(result.product);}
    catch {if (current(id)) setModalError('تعذر تحميل المعاينة. أغلق النافذة ثم أعد المحاولة.');}
    finally {finish(id);}
  }
  async function openReview(products: CatalogProduct[]) {
    if (!products.length || products.length > CATALOG_SELECTION_LIMIT) return;
    const id = begin('review'); if (id === null) return;
    captureFocus(); setReview(null); setModalError(''); setPriceErrors({}); setConfirmed(false); setPanel('review');
    try {const result = await actions.review(catalogSelections(products)); if (!current(id)) return; if (!result.review?.products.length || result.error) setModalError(result.error || 'تعذر تجهيز المراجعة. أعد تحميل المنتجات وتحقق من حالتها.'); else {setReview(result.review); setDrafts(catalogPriceDrafts(result.review.products));}}
    catch {if (current(id)) setModalError('تعذر تحميل المراجعة. احتفظنا بالمنتجات المحددة؛ حاول مرة أخرى.');}
    finally {finish(id);}
  }
  function select(products: CatalogProduct[], checked: boolean) {
    if (lock.current || panel) return;
    const eligibleNew = products.filter(product => product.canSelect && !selected.some(item => item.key === product.key));
    if (checked && selected.length + eligibleNew.length > CATALOG_SELECTION_LIMIT) setError(`يمكن تحديد ${CATALOG_SELECTION_LIMIT} منتجًا في المرة الواحدة. أضف المحدد أو أزل بعض المنتجات أولًا.`);
    setSelected(previous => changeCatalogSelection(previous, products, checked));
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review || !confirmed || lock.current) return;
    const validation = catalogPriceErrors(review.products, drafts); setPriceErrors(validation);
    if (Object.keys(validation).length) {setModalError('راجع حقول الأسعار المبيّنة أدناه. لم تتم إضافة أي منتج.'); return;}
    if (!Number.isFinite(Date.parse(review.expiresAt)) || Date.parse(review.expiresAt) <= Date.now()) {setModalError('انتهت صلاحية هذه المراجعة. حدّث المراجعة للتأكد من آخر الأسعار والمخزون.'); return;}
    const id = begin('approve'); if (id === null) return;
    setModalError('');
    try {
      const result = await actions.approve({token: review.token, confirmed: true, products: review.products.map(product => ({key: product.key, revision: product.revision, cost: normalizeCatalogPrice(drafts[product.key].cost), selling: normalizeCatalogPrice(drafts[product.key].selling)}))});
      if (!current(id)) return;
      if (result.error || !Number.isSafeInteger(result.added) || result.added! < 1) {setModalError(result.error || 'لم تكتمل الإضافة. حدّث المراجعة ثم أعد المحاولة.'); return;}
      const addedKeys = new Set(review.products.map(product => product.key));
      setSelected(previous => previous.filter(product => !addedKeys.has(product.key)));
      setData(previous => ({...previous, products: previous.products.map(product => addedKeys.has(product.key) ? {...product, status: 'added_hidden', statusLabel: 'مضاف — مخفي', canSelect: false} : product)}));
      setNotice(`تمت إضافة ${result.added} منتج إلى تربح. المنتجات مخفية وغير نشطة؛ لم يتم نشرها أو تفعيل الشراء.`);
      setPanel(null); setError('');
      try {const refreshed = await actions.search({query: data.query, supplierKey: data.supplierKey, page: data.page}); if (current(id)) {if (refreshed.data && !refreshed.error) setData(refreshed.data); else setError('تم الحفظ، لكن تعذر تحديث النتائج. اضغط بحث لتحديث الكتالوج.');}}
      catch {if (current(id)) setError('تم الحفظ، لكن تعذر تحديث النتائج. اضغط بحث لتحديث الكتالوج.');}
    } catch {if (current(id)) setModalError('تعذر تأكيد نتيجة الحفظ. أعد تحميل النتائج قبل المحاولة مجددًا لتجنب تكرار الإضافة.');}
    finally {finish(id);}
  }
  function openManage(product: CatalogProduct) {
    if (!product.canManage || lock.current) return;
    captureFocus(); setManaged(product); setSaleMode(product.pricingPolicy === 'source' ? 'source' : 'manual');
    setSaleValue(formatSar(product.sellingMinor ?? product.priceMinor)); setDeleteConfirmed(false); setModalError(''); setPanel('manage');
  }
  async function refreshCatalog(id: number) {
    const refreshed = await actions.search({query: data.query, supplierKey: data.supplierKey, page: data.page});
    if (current(id) && refreshed.data && !refreshed.error) setData(refreshed.data);
    else if (current(id)) setError('تم تنفيذ العملية، لكن تعذر تحديث القائمة. اضغط بحث لتحديث الكتالوج.');
  }
  async function updateSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!managed || lock.current) return;
    const id=begin('update'); if(id===null)return; setModalError('');
    try{const result=await actions.updateSale({key:managed.key,revision:managed.revision,mode:saleMode,selling:saleMode==='source'?formatSar(managed.priceMinor):normalizeCatalogPrice(saleValue)});if(!current(id))return;if(result.error||result.updated!==true){setModalError(result.error||'تعذر حفظ سعر البيع.');return;}setNotice('تم تحديث سعر البيع. بقيت حالة ظهور المنتج كما هي.');setPanel(null);await refreshCatalog(id);}
    catch{if(current(id))setModalError('تعذر تأكيد حفظ السعر. حدّث القائمة ثم أعد المحاولة.');}finally{finish(id);}
  }
  async function hide(product: CatalogProduct) {
    if (!product.canManage || lock.current) return; const id=begin('hide'); if(id===null)return; setError('');
    try{const result=await actions.hide({key:product.key,revision:product.revision});if(!current(id))return;if(result.error||result.hidden!==true){setError(result.error||'تعذر إخفاء المنتج.');return;}setNotice(`تم إخفاء «${product.name}» وإيقافه فورًا.`);setPanel(null);await refreshCatalog(id);}
    catch{if(current(id))setError('تعذر تأكيد الإخفاء. حدّث القائمة قبل المحاولة مجددًا.');}finally{finish(id);}
  }
  async function remove() {
    if (!managed || !deleteConfirmed || lock.current) return; const id=begin('remove'); if(id===null)return; setModalError('');
    try{const result=await actions.remove({key:managed.key,revision:managed.revision,confirmed:true});if(!current(id))return;if(result.error||result.removed!==true){setModalError(result.error||'تعذر حذف المنتج من تربح.');return;}setNotice(`تم حذف «${managed.name}» من تربح مع إبقائه في كتالوج سلة لإمكانية إضافته لاحقًا.`);setPanel(null);await refreshCatalog(id);}
    catch{if(current(id))setModalError('تعذر تأكيد الحذف. حدّث القائمة قبل المحاولة مجددًا.');}finally{finish(id);}
  }

  const selectedKeys = new Set(selected.map(product => product.key));
  const selectable = data.products.filter(product => product.canSelect);
  const visibleSelected = selectable.length > 0 && selectable.every(product => selectedKeys.has(product.key));
  const disabled = Boolean(busy || panel);
  return <section dir="rtl" className="min-w-0 space-y-5 pb-6 text-[#16294a]" aria-busy={busy === 'search'}>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-2 text-xs font-bold tracking-wide text-[#9a6713]">كتالوج الموردين · SALLA</p><h1 ref={heading} tabIndex={-1} className="text-2xl font-extrabold sm:text-3xl">منتجات سلة، أمامك بوضوح</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">تصفح المنتجات المستوردة، عاين التفاصيل، ثم حدد ما تريد إضافته إلى تربح. سعر البيع الافتراضي هو سعر المورد ويمكن تغييره قبل الاعتماد أو بعده.</p></div><span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><ShieldCheck aria-hidden="true" className="h-4 w-4"/>الإضافة لا تنشر المنتج</span></header>
    {exampleState && <p role="note" className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">معاينة تجريبية — بيانات نموذجية، لا تمثل مخزون المتجر الفعلي.</p>}
    {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900"><CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0"/>{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-7 text-rose-800">{error}</p>}
    <form onSubmit={event => {event.preventDefault(); void search({query: query.trim(), supplierKey: supplier, page: 1});}} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto] sm:items-end"><div><label htmlFor={queryId} className="mb-2 block text-xs font-bold">ابحث بالاسم أو رمز المنتج</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400"/><input id={queryId} className={`${input} pr-9`} value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="اسم المنتج أو SKU" type="search"/></div></div><div><label htmlFor={supplierId} className="mb-2 flex items-center gap-1.5 text-xs font-bold"><SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5"/>المورد</label><select id={supplierId} className={input} value={supplier} onChange={event => setSupplier(event.target.value)}><option value="">جميع الموردين</option>{data.suppliers.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></div><button type="submit" className={primary}>{busy === 'search' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin"/> : <Search aria-hidden="true" className="h-4 w-4"/>}بحث</button></fieldset>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">{data.products.length.toLocaleString('ar-SA')} منتج في هذه الصفحة{data.query && <span> · نتائج «{data.query}»</span>}</p><button type="button" className={`${secondary} !min-h-10 !px-3 !py-2 !text-xs`} disabled={disabled || !selectable.length} onClick={() => select(selectable, !visibleSelected)}><Check aria-hidden="true" className="h-4 w-4"/>{visibleSelected ? 'إلغاء تحديد هذه الصفحة' : 'تحديد منتجات هذه الصفحة'}</button></div>
    {!data.products.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center"><Package aria-hidden="true" className="mx-auto h-12 w-12 text-slate-300"/><h2 className="mt-4 text-lg font-bold">لا توجد منتجات مطابقة</h2><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">جرّب اسمًا أو رمزًا آخر، أو اختر جميع الموردين. تظهر المنتجات هنا بعد استيرادها من سلة.</p></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{data.products.map(product => {
      const checked = selectedKeys.has(product.key);
      return <article key={product.key} className={`min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm transition ${checked ? 'border-[#b97d16] ring-2 ring-amber-100' : 'border-slate-200'}`}>
        <div className="relative aspect-[4/3] border-b border-slate-100 bg-[#f8f9fa]"><ProductImage src={product.image} name={product.name}/><label className="absolute right-3 top-3 z-[1] flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white/95 shadow-sm"><input type="checkbox" aria-label={`تحديد ${product.name}`} checked={checked} disabled={disabled || (!product.canSelect && !checked)} onChange={event => select([product], event.target.checked)} className="h-5 w-5 accent-[#16294a]"/></label><div className="absolute bottom-3 right-3"><Status product={product}/></div></div>
        <div className="space-y-3 p-4"><p className="flex items-center gap-1.5 text-xs text-slate-500"><Store aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{product.supplierName}</span></p><h2 className="line-clamp-2 min-h-12 text-base font-extrabold leading-6">{product.name}</h2><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3"><div><p className="text-[11px] text-slate-400">سعر المورد</p><p className="mt-0.5 text-lg font-extrabold"><Price minor={product.priceMinor}/></p></div><div><p className="text-[11px] text-slate-400">سعر البيع في تربح</p><p className="mt-0.5 text-lg font-extrabold">{product.sellingMinor===null?<span className="text-xs text-slate-500">افتراضيًا سعر المورد</span>:<Price minor={product.sellingMinor}/>}</p></div></div><p className={`text-xs ${product.available ? 'text-slate-500' : 'font-semibold text-rose-700'}`}>المخزون: {stock(product)}</p>{product.sku && <p className="truncate text-xs text-slate-500">SKU: <bdi>{product.sku}</bdi></p>}<div className="grid gap-2 border-t border-slate-100 pt-3"><button type="button" className={secondary} disabled={disabled} onClick={() => void preview(product)}><Eye aria-hidden="true" className="h-4 w-4"/>معاينة المنتج</button>{product.canManage?<><button type="button" className={primary} disabled={disabled} onClick={()=>openManage(product)}><Pencil aria-hidden="true" className="h-4 w-4"/>تعديل سعر البيع</button><button type="button" className={secondary} disabled={disabled||(!product.active&&!product.visible)} onClick={()=>void hide(product)}><EyeOff aria-hidden="true" className="h-4 w-4"/>إخفاء من تربح</button><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-45" disabled={disabled} onClick={()=>openManage(product)}><Trash2 aria-hidden="true" className="h-4 w-4"/>حذف من تربح</button></>:<button type="button" className={primary} disabled={disabled || !product.canSelect} onClick={() => void openReview([product])}><Plus aria-hidden="true" className="h-4 w-4"/>إضافة إلى تربح</button>}</div></div>
      </article>;
    })}</div>}
    <nav aria-label="صفحات كتالوج الموردين" className="flex items-center justify-center gap-4 py-3"><button type="button" className={secondary} disabled={disabled || data.page <= 1} onClick={() => void search({query: data.query, supplierKey: data.supplierKey, page: Math.max(1, data.page - 1)})}><ChevronRight aria-hidden="true" className="h-4 w-4"/>السابق</button><span className="text-sm">صفحة <bdi>{data.page}</bdi></span><button type="button" className={secondary} disabled={disabled || !data.hasNext} onClick={() => void search({query: data.query, supplierKey: data.supplierKey, page: data.page + 1})}>التالي<ChevronLeft aria-hidden="true" className="h-4 w-4"/></button></nav>
    {!!selected.length && <aside aria-label="المنتجات المحددة" className="sticky bottom-4 z-20 rounded-2xl border border-[#294466] bg-[#16294a] p-4 text-white shadow-xl"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{selected.length} منتج محدد <span className="text-xs font-normal text-slate-300">من {CATALOG_SELECTION_LIMIT}</span></p><p className="mt-1 text-xs text-slate-300">يبقى اختيارك محفوظًا أثناء البحث والتنقل بين الصفحات.</p></div><div className="flex gap-2"><button type="button" disabled={disabled} className="min-h-11 rounded-xl px-3 text-sm text-white underline underline-offset-4 disabled:opacity-40" onClick={() => setSelected([])}>مسح التحديد</button><button type="button" disabled={disabled} onClick={() => void openReview(selected)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#efb643] px-4 py-2 text-sm font-extrabold text-[#16294a] hover:bg-[#f5c76f] disabled:opacity-40"><Plus aria-hidden="true" className="h-4 w-4"/>مراجعة وإضافة المحدد</button></div></div><div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto">{selected.map(product => <span key={product.key} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-white/20 bg-white/10 pr-2 text-xs"><span className="max-w-48 truncate">{product.name}</span><button type="button" disabled={disabled} onClick={() => select([product], false)} aria-label={`إزالة ${product.name} من المحدد`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40"><X aria-hidden="true" className="h-3.5 w-3.5"/></button></span>)}</div></aside>}
    {panel && <CatalogDialog key={panel} title={panel === 'preview' ? 'معاينة المنتج' : panel === 'review' ? 'مراجعة الإضافة إلى تربح' : 'إدارة السعر والعرض والحذف'} onClose={close} saving={Boolean(busy&&['approve','update','hide','remove'].includes(busy))} returnFocus={opener.current} fallbackFocus={heading.current}>
      {modalError && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-7 text-rose-800">{modalError}</p>}
      {panel === 'preview' && (busy === 'details' ? <Spinner label="جاري تحميل تفاصيل المنتج…"/> : detail && <DetailContent key={detail.key} product={detail} onAdd={() => void openReview([detail])}/>)}
      {panel === 'review' && (busy === 'review' ? <Spinner label="جاري مراجعة أحدث الأسعار والمخزون…"/> : review && <form onSubmit={approve} className="space-y-4 p-4 sm:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950"><p className="font-bold">راجع {review.products.length} منتج قبل الإضافة</p><p>تكلفة التوريد هي السعر المتفق عليه مع المورد، وقد تختلف عن السعر الظاهر في سلة. جميع المنتجات تضاف مخفية وغير نشطة.</p><p className="mt-1 text-xs">صلاحية هذه المراجعة: {timestamp(review.expiresAt)}</p></div>
        <fieldset disabled={busy === 'approve'} className="space-y-4">{review.products.map((product, index) => {
          const rowError = priceErrors[product.key];
          return <article key={product.key} className={`rounded-2xl border bg-white p-4 ${rowError ? 'border-rose-300' : 'border-slate-200'}`}><div className="flex gap-3"><div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-100"><ProductImage src={product.image} name={product.name} sizes="80px"/></div><div className="min-w-0"><h3 className="break-words font-extrabold leading-6">{product.name}</h3><p className="mt-1 text-xs text-slate-500">{product.supplierName}</p>{product.sku && <p className="mt-1 break-all text-xs text-slate-500">SKU: <bdi>{product.sku}</bdi></p>}<div className="mt-2"><Status product={product}/></div></div></div><div className="my-4 flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span>سعر سلة: <Price minor={product.priceMinor}/></span><span>المخزون: {stock(product)}</span></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">تكلفة التوريد المتفق عليها (ر.س)<input aria-label={`تكلفة التوريد — ${product.name}`} aria-invalid={Boolean(rowError)} aria-describedby={rowError ? `catalog-price-error-${index}` : undefined} required inputMode="decimal" autoComplete="off" dir="ltr" placeholder="أدخل التكلفة المتفق عليها" className={`${input} mt-2`} value={drafts[product.key]?.cost ?? ''} onChange={event => {const value = event.target.value; setDrafts(previous => ({...previous, [product.key]: {...previous[product.key], cost: value}})); setConfirmed(false);}}/></label><label className="block text-sm font-semibold">سعر البيع في تربح (ر.س)<input aria-label={`سعر البيع — ${product.name}`} aria-invalid={Boolean(rowError)} aria-describedby={rowError ? `catalog-price-error-${index}` : undefined} required inputMode="decimal" autoComplete="off" dir="ltr" className={`${input} mt-2`} value={drafts[product.key]?.selling ?? ''} onChange={event => {const value = event.target.value; setDrafts(previous => ({...previous, [product.key]: {...previous[product.key], selling: value}})); setConfirmed(false);}}/></label></div>
          {rowError && <p id={`catalog-price-error-${index}`} className="mt-2 text-xs leading-6 text-rose-700">{rowError}</p>}{product.costMinor === null && <p className="mt-2 text-xs leading-6 text-slate-500">لم تُسجل تكلفة لهذا المنتج. أدخلها صراحة قبل التأكيد.</p>}{product.hasOptions && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">المنتج يحتوي على خيارات أو أصناف متعددة. يبقى غير نشط إلى حين مراجعة ربط الخيارات والمخزون.</p>}</article>;
        })}<label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7"><input type="checkbox" className="mt-1.5 h-5 w-5 shrink-0 accent-[#16294a]" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>راجعت المنتجات والتكلفة وسعر البيع، وأوافق على إضافتها إلى تربح مخفية وغير نشطة.</span></label></fieldset>
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-[#fafaf8] py-3"><button type="submit" className={`${primary} flex-1`} disabled={!confirmed || busy === 'approve'}>{busy === 'approve' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin"/> : <Check aria-hidden="true" className="h-4 w-4"/>}{busy === 'approve' ? 'جاري الحفظ…' : `تأكيد إضافة ${review.products.length} منتج`}</button><button type="button" className={secondary} disabled={busy === 'approve'} onClick={close}>رجوع</button>{modalError && <button type="button" className={secondary} disabled={busy === 'approve'} onClick={() => void openReview(review.products)}>تحديث المراجعة</button>}</div>
      </form>)}
      {panel === 'review' && !review && busy !== 'review' && <div className="p-4"><button type="button" className={secondary} onClick={close}>العودة إلى الكتالوج</button></div>}
      {panel === 'manage' && managed && <div className="space-y-5 p-4 sm:p-6"><div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-extrabold">{managed.name}</h3><p className="mt-1 text-xs text-slate-500">{managed.supplierName}{managed.sku?` · SKU: ${managed.sku}`:''}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">سعر المورد</p><p className="font-bold"><Price minor={managed.priceMinor}/></p></div><div><p className="text-xs text-slate-500">سعر البيع الحالي</p><p className="font-bold"><Price minor={managed.sellingMinor??managed.priceMinor}/></p></div></div></div><form onSubmit={updateSale} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">سعر البيع</h3><label className="block text-sm font-semibold">طريقة السعر<select className={`${input} mt-2`} value={saleMode} disabled={busy==='update'} onChange={event=>setSaleMode(event.target.value as 'source'|'manual')}><option value="source">سعر المورد (الافتراضي)</option><option value="manual">سعر بيع يدوي</option></select></label><label className="block text-sm font-semibold">سعر البيع في تربح (ر.س)<input className={`${input} mt-2`} inputMode="decimal" dir="ltr" required={saleMode==='manual'} disabled={saleMode==='source'||busy==='update'} value={saleMode==='source'?formatSar(managed.priceMinor):saleValue} onChange={event=>setSaleValue(event.target.value)}/></label><button className={primary} disabled={busy==='update'}>{busy==='update'?<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>:<Check className="h-4 w-4" aria-hidden="true"/>}حفظ سعر البيع</button></form><section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-bold">الإخفاء</h3><p className="text-sm leading-7">يوقف المنتج ويخفيه فورًا، ويمكن إعادته لاحقًا من إعداداته.</p><button type="button" className={secondary} disabled={busy==='hide'||(!managed.active&&!managed.visible)} onClick={()=>void hide(managed)}><EyeOff aria-hidden="true" className="h-4 w-4"/>{busy==='hide'?'جاري الإخفاء…':'إخفاء من تربح'}</button></section><section className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><h3 className="font-bold text-rose-900">حذف من تربح</h3><p className="text-sm leading-7 text-rose-800">يحذف نسخة تربح فقط، ويُبقي المنتج المستورد من سلة لتستطيع إضافته لاحقًا. إذا وُجد سجل طلبات أو حجوزات فسيُرفض الحذف ويظل الإخفاء متاحًا.</p><label className="flex items-start gap-2 text-sm text-rose-900"><input type="checkbox" className="mt-1 h-5 w-5" checked={deleteConfirmed} disabled={busy==='remove'} onChange={event=>setDeleteConfirmed(event.target.checked)}/>أفهم أن المنتج سيُحذف من تربح مع إبقائه في كتالوج المورد.</label><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45" disabled={!deleteConfirmed||busy==='remove'} onClick={()=>void remove()}><Trash2 aria-hidden="true" className="h-4 w-4"/>{busy==='remove'?'جاري الحذف…':'تأكيد حذف المنتج من تربح'}</button></section></div>}
    </CatalogDialog>}
  </section>;
}

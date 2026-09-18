'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Armchair, BadgeCheck, BriefcaseBusiness, Building2, Camera, Car, Check, CheckCircle2, ChevronLeft, CircleHelp, ClipboardList, Clock3, Eye, Factory, FilePenLine, ImagePlus, LayoutDashboard, MapPin, MessageCircle, MoreHorizontal, Package, Pause, Pencil, Play, Plus, Search, ShieldCheck, Smartphone, Sparkles, Store, Tag, Trash2, TrendingUp, Truck, Wallet, Wheat, Wrench, X } from 'lucide-react';
import { categories, cities, listings, money } from '../lib/demo-data';
import { notify, readLocal, writeLocal } from '../lib/preview';
import { Modal } from './ui';
import './seller.css';
import './category-details.css';
import './single-page-ad.css';
import {resolveAd,readAssignments} from '../lib/classification-store';
import {assign,validTarget} from '../lib/classification';
import { CategoryDetails } from './category-details';
import { catalog, getProfile as baseProfile, cleanDetails, displayDetails, validateDetails, changeClassification, normalizeNumber, updateDetail, type Details } from '../lib/category-fields';

import { FIELD_SETTINGS_KEY, applyFieldSettings, type FieldSettings, preserveStoredDetails } from '../lib/field-settings';
function getProfile(category: string, subcategory: string, forStorage = false) {
  const settings = typeof window === 'undefined' ? {} : readLocal<FieldSettings>(FIELD_SETTINGS_KEY, {});
  const config = settings && typeof settings === 'object' ? settings[`${category}/${subcategory}`] : undefined;
  const storageConfig = forStorage ? { ...config, enabled: true, fields: Object.fromEntries(Object.entries(config?.fields || {}).map(([id, value]) => [id, { ...value, hidden: false }])) } : config;
  return applyFieldSettings(baseProfile(category, subcategory), storageConfig);
}
// Shared local preview contract. Helpers add the `trbhh-v2-` prefix.
export const SELLER_ADS_KEY = 'seller-ads-v1';
export const AD_DRAFT_KEY = 'ad-draft-v1';
type Intent = 'offer' | 'wanted';
type AdStatus = 'active' | 'paused' | 'sold';
type AdForm = { intent: Intent; category: string; subcategory: string; title: string; description: string; price: string; city: string; condition: string; images: string[]; spec1: string; spec2: string; details: Details };
export type SellerAd = AdForm & { id: string; status: AdStatus; createdAt: string; sourceId?: string; classificationRevision?: string };
type AdDraft = { version: 1; form: AdForm; step: number; editingId: string | null; savedAt: number };
type Errors = Record<string, string | undefined>;
const emptyForm: AdForm = { intent: 'offer', category: '', subcategory: '', title: '', description: '', price: '', city: '', condition: '', images: [], spec1: '', spec2: '', details: {} };
const adSections = [
  { id: 'classification', title: 'نوع الإعلان والتصنيف', hint: 'اختر النوع والقسم الفرعي لتظهر الحقول المناسبة لمجاله.' },
  { id: 'details', title: 'تفاصيل الإعلان', hint: 'أكمل البيانات الأساسية والمواصفات المتخصصة. النجمة تعني حقلًا مطلوبًا.' },
  { id: 'photos', title: 'صور الإعلان', hint: 'الصور اختيارية في التجربة. الصورة الأولى هي الغلاف.' },
  { id: 'review', title: 'المعاينة والنشر', hint: 'معاينة مباشرة تتحدث مع بياناتك. راجع إعلانك ثم احفظه في اللوحة التجريبية.' },
];
function sectionForError(key: string) { return ['category', 'subcategory'].includes(key) ? 'classification' : 'details'; }
function jumpToSection(id: string) {
  const section = document.getElementById(`ad-${id}`);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({ block: 'start' });
}
function SectionHeading({ index }: { index: number }) {
  const section = adSections[index];
  return <div className="ad-section-heading"><span aria-hidden="true">{index + 1}</span><div><h2 id={`ad-${section.id}-heading`}>{section.title}</h2><p>{section.hint}</p></div></div>;
}
const categoryIcons = { عقارات: Building2, سيارات: Car, 'معدات وآليات': Truck, 'مواشي وزراعة': Wheat, إلكترونيات: Smartphone, 'منزل وأثاث': Armchair, خدمات: Wrench, 'شركات وموردون': Factory, وظائف: BriefcaseBusiness, أخرى: MoreHorizontal };
const subcategories = Object.fromEntries(Object.entries(catalog).map(([name, branches]) => [name, Object.keys(branches)]));
const statusLabels: Record<AdStatus, string> = { active: 'نشط', paused: 'متوقف', sold: 'مكتمل' };

function isForm(value: unknown): value is AdForm {
  if (!value || typeof value !== 'object') return false;
  const v = value as AdForm;
  return ['offer', 'wanted'].includes(v.intent) && ['category', 'subcategory', 'title', 'description', 'price', 'city', 'condition', 'spec1', 'spec2'].every(k => typeof v[k as keyof AdForm] === 'string') && Array.isArray(v.images) && v.images.every(image => typeof image === 'string' && (image.startsWith('/images/') || /^data:image\/(jpeg|png|webp);base64,/.test(image)));
}
function normalizeForm(form: AdForm): AdForm {
  const profile = getProfile(form.category, form.subcategory, true);
  // Preserve old draft text and photos. Never guess the meaning of the old two generic specs.
  const details = preserveStoredDetails(form.details);
  for (const field of profile?.fields || []) if (field.type === 'number' && typeof details[field.id] === 'string') details[field.id] = normalizeNumber(details[field.id] as string);
  if (profile?.pricing === 'salary' && !details.salaryMin && form.price) details.salaryMin = form.price;
  return { ...form, details, condition: profile?.condition ? form.condition : '', price: profile?.pricing === 'salary' ? '' : form.price };
}
function getDraft(): AdDraft | null {
  const value = readLocal<AdDraft | null>(AD_DRAFT_KEY, null);
  return value?.version === 1 && isForm(value.form) && Number.isFinite(value.savedAt) ? { ...value, form: normalizeForm(value.form) } : null;
}
function restoreDraftForm(draft: AdDraft): AdForm {
  if (!draft.editingId) return draft.form;
  const assignment=readAssignments()[`local:${draft.editingId}`];
  if (validTarget(assignment) && assignment.updatedAt && assignment.updatedAt>draft.savedAt &&
    getAds().find(ad=>ad.id===draft.editingId)?.classificationRevision===assignment.fromRevision) {
    return normalizeForm(assign([{...draft.form,id:draft.editingId}],[draft.editingId],assignment)[0]);
  }
  return draft.form;
}
function initialAds(): SellerAd[] {
  return [listings[6], listings[2], listings[7]].map((listing, index) => ({ ...emptyForm, id: `demo-${listing.id}`, sourceId: listing.id, title: listing.title, description: listing.description, price: String(listing.price), city: listing.city, category: listing.category, subcategory: listing.category === 'منزل وأثاث' ? (index === 0 ? 'أثاث مكتبي' : 'أثاث منزلي') : 'رياضة وهوايات', condition: listing.condition, images: listing.images, status: index === 2 ? 'paused' : 'active', createdAt: '2026-09-09T10:00:00.000Z' }));
}
function getAds(): SellerAd[] {
  const stored = readLocal<unknown>(SELLER_ADS_KEY, null);
  if (!Array.isArray(stored)) return initialAds().map(ad => resolveAd(ad,'local',readAssignments()));
  return stored.filter((ad): ad is SellerAd => isForm(ad) && typeof (ad as SellerAd).id === 'string' && ['active', 'paused', 'sold'].includes((ad as SellerAd).status)).map(ad => resolveAd({ ...ad, details: preserveStoredDetails(ad.details) },'local',readAssignments()));
}
function priceText(form: AdForm) {
  const profile = getProfile(form.category, form.subcategory);
  const details = cleanDetails(profile, form.details);
  if (profile?.pricing === 'salary') {
    const range = [details.salaryMin, details.salaryMax].filter(value => value !== undefined).map(value => money(Number(value))).join(' – ');
    return range ? `الراتب ${range} ر.س${details.salaryPeriod ? ` / ${details.salaryPeriod}` : ''}` : 'الراتب يحدد عند التواصل';
  }
  const period = details.purpose === 'للإيجار' ? details.rentPeriod || details.rentalUnit : '';
  const suffix = period ? ` / ${period}` : details.priceBasis ? ` / ${details.priceBasis}` : profile?.pricing === 'supplier' && details.unit ? ` / ${details.unit}` : '';
  return form.price ? `${money(Number(normalizeNumber(form.price)))} ر.س${suffix}` : form.intent === 'wanted' ? 'الميزانية قابلة للنقاش' : 'السعر عند التواصل';
}
function AdPicture({ ad, className = '' }: { ad: AdForm; className?: string }) {
  return ad.images.length ? <img className={className} src={ad.images[0]} alt={ad.title || 'صورة الإعلان'} /> : <div className={`seller-empty-image ${className}`}><Camera size={32} /><span>{ad.intent === 'wanted' ? 'طلب شراء' : 'بدون صورة'}</span></div>;
}
function AdPreview({ ad }: { ad: AdForm }) {
  const specs = displayDetails(getProfile(ad.category, ad.subcategory), ad.details);
  return <article className="seller-ad-preview"><AdPicture ad={ad} className="seller-preview-cover" /><div className="seller-preview-body"><div className="seller-inline"><span className="seller-pill gold">{ad.category === 'وظائف' ? (ad.intent === 'wanted' ? 'باحث عن عمل' : 'فرصة عمل') : ad.intent === 'wanted' ? 'مطلوب' : 'معروض'}</span><span className="seller-muted">{ad.category} · {ad.subcategory}</span></div><h2>{ad.title || 'عنوان إعلانك'}</h2><strong className="seller-preview-price">{priceText(ad)}</strong><p className="seller-inline seller-muted"><MapPin size={16} />{ad.city || 'المدينة'}{getProfile(ad.category, ad.subcategory)?.condition && ad.condition && <> · {ad.condition}</>}</p><p className="seller-description">{ad.description}</p>{specs.length > 0 && <dl className="seller-specs">{specs.map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{ad.images.length > 1 && <div className="seller-preview-thumbs">{ad.images.slice(1).map((src, index) => <img key={index} src={src} alt={`صورة إضافية ${index + 2}`} />)}</div>}<div className="seller-preview-owner"><span className="seller-avatar small">د</span><div><strong>متجرك التجريبي</strong><span className="seller-muted">سيظهر الإعلان هنا داخل المعاينة</span></div><ShieldCheck size={21} /></div></div></article>;
}

export function NewAdPage() {
  const [form, setForm] = useState<AdForm>(emptyForm);
  const [submittedErrors, setErrors] = useState<Errors>({});
  const [hydrated, setHydrated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [publishError, setPublishError] = useState('');
  const [complete, setComplete] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const latestDraft = useRef<AdDraft | null>(null);
  const hasContent = Boolean(form.category || form.title || form.description || form.images.length);
  const profile = getProfile(form.category, form.subcategory);
  const optionalPrice = form.intent === 'wanted' || ['service', 'supplier', 'salary'].includes(profile?.pricing || '');
  const showCondition = profile?.condition === true;
  const showPrice = profile?.pricing !== 'salary';

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedEdit = query.get('edit');
    const draft = getDraft();
    if (requestedEdit) {
      const ad = getAds().find(item => item.id === requestedEdit);
      if (draft?.editingId === requestedEdit) {
        setForm(restoreDraftForm(draft)); setEditingId(requestedEdit); setRestored(true);
      }
      else if (ad) { setForm(normalizeForm(ad)); setEditingId(requestedEdit); }
      else notify('لم نجد الإعلان المطلوب. يمكنك إنشاء إعلان تجريبي جديد.');
    } else if (draft) { setForm(restoreDraftForm(draft)); setEditingId(draft.editingId || null); setRestored(true); }
    else if (query.get('intent') === 'wanted' || query.get('type') === 'wanted') setForm({ ...emptyForm, intent: 'wanted' });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || complete || !hasContent) { latestDraft.current = null; return; }
    const snapshot: AdDraft = { version: 1, form, step: 0, editingId, savedAt: Date.now() };
    latestDraft.current = snapshot;
    const timer = window.setTimeout(() => {
      writeLocal(AD_DRAFT_KEY, snapshot);
      setSaveStatus(getDraft()?.savedAt === snapshot.savedAt ? 'saved' : 'failed');
    }, 550);
    return () => window.clearTimeout(timer);
  }, [form, editingId, hydrated, complete, hasContent]);

  useEffect(() => {
    const flushDraft = () => { if (latestDraft.current) writeLocal(AD_DRAFT_KEY, latestDraft.current); };
    window.addEventListener('pagehide', flushDraft);
    return () => { window.removeEventListener('pagehide', flushDraft); flushDraft(); };
  }, []);

  function field<K extends keyof AdForm>(key: K, value: AdForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setSaveStatus('saving');
    setPublishError('');
  }
  function chooseCategory(category: string) {
    setForm(current => changeClassification(current, category));
    setErrors({});
    setSaveStatus('saving');
  }
  function chooseSubcategory(subcategory: string) {
    setForm(current => changeClassification(current, current.category, subcategory));
    setErrors({}); setSaveStatus('saving'); setPublishError('');
  }
  function detail(id: string, value: string | string[]) {
    setForm(current => ({ ...current, details: updateDetail(profile, current.details, id, value) }));
    setErrors(current => ({ ...current, [`detail.${id}`]: undefined }));
    setSaveStatus('saving'); setPublishError('');
  }
  function validate(targetStep: number): Errors {
    const result: Errors = {};
    if (targetStep === 0) {
      if (!subcategories[form.category]) result.category = 'اختر القسم الأقرب لإعلانك.';
      if (!getProfile(form.category, form.subcategory)) result.subcategory = 'اختر التصنيف الفرعي.';
    }
    if (targetStep === 1) {
      if (!profile) result.subcategory = 'هذا الفرع غير متاح. ارجع واختر فرعاً مفعلاً.';
      if (form.title.trim().length < 10) result.title = 'أضف عنوانًا واضحًا من 10 أحرف على الأقل.';
      if (form.description.trim().length < 30) result.description = 'اكتب وصفًا من 30 حرفًا على الأقل يساعد الآخرين على فهم إعلانك.';
      if (!cities.slice(1).includes(form.city)) result.city = 'اختر المدينة.';
      if (showPrice && ((!optionalPrice && !form.price) || (form.price && (!Number.isFinite(Number(normalizeNumber(form.price))) || Number(normalizeNumber(form.price)) <= 0 || Number(normalizeNumber(form.price)) > 100000000)))) result.price = optionalPrice ? 'أدخل مبلغًا أكبر من صفر، أو اترك الحقل فارغًا.' : 'أدخل سعرًا أكبر من صفر وحتى 100,000,000 ر.س.';
      Object.entries(validateDetails(profile, form.details, form.intent)).forEach(([key, message]) => { result[`detail.${key}`] = message; });
      if (showCondition && form.intent === 'offer' && !['جديد', 'مستعمل'].includes(form.condition)) result.condition = 'حدد حالة المنتج.';
    }
    return result;
  }
  function saveNow() {
    const snapshot: AdDraft = { version: 1, form, step: 0, editingId, savedAt: Date.now() };
    writeLocal(AD_DRAFT_KEY, snapshot);
    const success = getDraft()?.savedAt === snapshot.savedAt;
    setSaveStatus(success ? 'saved' : 'failed');
    if (success) notify('حُفظت المسودة محليًا. يمكنك العودة لإكمالها.');
  }
  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploadError('');
    const selected = Array.from(files);
    if (photoInput.current) photoInput.current.value = '';
    if (selected.length + form.images.length > 3) { setUploadError('يمكنك إضافة 3 صور كحد أقصى. احذف صورة لإضافة غيرها.'); return; }
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setUploadError('اختر صور JPG أو PNG أو WebP فقط.'); return; }
    if (selected.some(file => file.size > 1024 * 1024)) { setUploadError('الحد الأقصى لحجم الصورة 1 ميجابايت. جرّب صورة أصغر.'); return; }
    setUploading(true);
    try {
      const images = await Promise.all(selected.map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          const check = new Image();
          check.onload = () => resolve(result);
          check.onerror = () => reject(new Error('invalid image'));
          check.src = result;
        };
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      })));
      setForm(current => ({ ...current, images: [...current.images, ...images].slice(0, 3) }));
      setSaveStatus('saving');
    } catch { setUploadError('تعذرت قراءة إحدى الصور. تأكد من صلاحيتها وجرّب مرة أخرى.'); }
    finally { setUploading(false); if (photoInput.current) photoInput.current.value = ''; }
  }
  function publish() {
    const found = { ...validate(0), ...validate(1) };
    if (Object.keys(found).length) {
      setErrors(found);
      window.setTimeout(() => {
        errorSummary.current?.focus({ preventScroll: true });
        errorSummary.current?.scrollIntoView({ block: 'center' });
      }, 0);
      return;
    }
    setErrors({});
    const ads = getAds();
    const existing = ads.find(ad => ad.id === editingId);
    const savedAd: SellerAd = { ...form, classificationRevision: crypto.randomUUID(), details: preserveStoredDetails(form.details), price: showPrice ? normalizeNumber(form.price) : '', condition: showCondition ? form.condition : '', title: form.title.trim(), description: form.description.trim(), id: existing?.id || `local-${Date.now()}`, status: existing?.status || 'active', createdAt: existing?.createdAt || new Date().toISOString() };
    const updated = existing ? ads.map(ad => ad.id === existing.id ? savedAd : ad) : [savedAd, ...ads];
    // Free the duplicate image payload while moving a draft into saved ads.
    writeLocal(AD_DRAFT_KEY, null);
    writeLocal(SELLER_ADS_KEY, updated);
    const persisted = readLocal<SellerAd[]>(SELLER_ADS_KEY, []);
    if (!Array.isArray(persisted) || JSON.stringify(persisted.find(ad => ad.id === savedAd.id)) !== JSON.stringify(savedAd)) {
      const retryDraft: AdDraft = { version: 1, form, step: 0, editingId, savedAt: Date.now() };
      writeLocal(AD_DRAFT_KEY, retryDraft);
      setSaveStatus(getDraft()?.savedAt === retryDraft.savedAt ? 'saved' : 'failed');
      setPublishError('لم يُحفظ الإعلان في هذا المتصفح. قلّل حجم الصور ثم أعد المحاولة؛ مسودتك الحالية ما زالت متاحة هنا.');
      return;
    }
    writeLocal(AD_DRAFT_KEY, null);
    latestDraft.current = null;
    setComplete(true); setRestored(false);
    window.dispatchEvent(new Event('trbhh-seller-updated'));
  }
  function resetDraft() {
    latestDraft.current = null;
    writeLocal(AD_DRAFT_KEY, null); setForm(emptyForm); setEditingId(null); setRestored(false); setErrors({}); setSaveStatus('idle'); setDiscardOpen(false); setUploadError('');
    window.history.replaceState(null, '', '/ads/new/');
    notify('بدأت مسودة جديدة.');
  }

  // Only retain attempted errors that still apply to the current intent and visible fields.
  const currentValidation = { ...validate(0), ...validate(1) };
  const errors: Errors = Object.fromEntries(Object.keys(submittedErrors)
    .filter(key => submittedErrors[key] && currentValidation[key])
    .map(key => [key, currentValidation[key]]));
  const error = (name: keyof AdForm) => errors[name] ? <span className="seller-field-error" id={`error-${name}`} role="alert">{errors[name]}</span> : null;

  if (complete) return <div className="container seller-page seller-complete"><div className="seller-success-icon"><CheckCircle2 size={44} /></div><span className="seller-eyebrow">تجربة مكتملة</span><h1>{editingId ? 'حُفظت تعديلات إعلانك' : 'إعلانك التجريبي جاهز'}</h1><p>أُضيف إلى لوحة البائع في هذا المتصفح. يمكنك معاينته وتعديله وتجربة إدارة حالته.</p><div className="seller-demo-note"><ShieldCheck size={20} /><span>هذه معاينة محلية؛ لم يُنشر الإعلان للعموم.</span></div><div className="seller-inline seller-complete-actions"><Link className="button primary" href="/seller/">الذهاب إلى لوحة البائع<ArrowLeft size={18} /></Link><button type="button" className="button secondary" onClick={() => { resetDraft(); setComplete(false); }}>إضافة إعلان آخر</button></div></div>;

  return <div className="container seller-page seller-create-page">
    <div className="seller-breadcrumb"><Link href="/">الرئيسية</Link><ChevronLeft size={14} /><Link href="/seller/">لوحة البائع</Link><ChevronLeft size={14} /><span>{editingId ? 'تعديل إعلان' : 'إضافة إعلان'}</span></div>
    <div className="seller-page-head"><div><span className="seller-eyebrow">ابدأ حكاية بيع جديدة</span><h1>{editingId ? 'عدّل إعلانك' : 'إعلانك يبدأ من هنا'}</h1><p>كل بيانات إعلانك في صفحة واحدة. اختر الفرع ثم أكمل الأقسام بالترتيب الذي يناسبك.</p></div><Link href="/seller/" className="seller-text-link">لوحة البائع<ArrowLeft size={18} /></Link></div>
    {restored && <div className="seller-restored"><div><FilePenLine size={20} /><span>استعدنا مسودتك السابقة. أكمل من حيث توقفت.</span></div><button type="button" onClick={() => setDiscardOpen(true)}>بدء إعلان جديد</button></div>}
    <div className="seller-form-layout"><div className="seller-form-main">
      <nav className="ad-section-nav" aria-label="أقسام إضافة الإعلان">{adSections.map((section, index) => <a key={section.id} href={`#ad-${section.id}`} onClick={event => { event.preventDefault(); jumpToSection(section.id); }}><span>{index + 1}</span>{section.title}</a>)}</nav>
      {Object.values(errors).some(Boolean) && <div className="ad-error-summary" role="alert" tabIndex={-1} ref={errorSummary}><h2>أكمل البيانات التالية قبل النشر</h2><ul>{Object.entries(errors).filter(([, message]) => message).map(([key, message]) => <li key={key}><a href={`#ad-${sectionForError(key)}`} onClick={event => { event.preventDefault(); jumpToSection(sectionForError(key)); }}>{message}</a></li>)}</ul></div>}
      {!hydrated ? <p className="seller-loading">جارٍ تجهيز مسودتك…</p> : <>
        <section id="ad-classification" className="seller-form-panel ad-page-section" tabIndex={-1} aria-labelledby="ad-classification-heading"><SectionHeading index={0} />
          <div className="seller-fields"><div className="seller-intents" aria-label="نوع الإعلان"><button type="button" aria-pressed={form.intent === 'offer'} className={form.intent === 'offer' ? 'selected' : ''} onClick={() => field('intent', 'offer')}><span className="seller-intent-icon"><Tag size={24} /></span><span><strong>أعرض منتجاً أو خدمة أو فرصة عمل</strong><small>بيع، إيجار، خدمات أو توظيف</small></span><span className="seller-radio">{form.intent === 'offer' && <span />}</span></button><button type="button" aria-pressed={form.intent === 'wanted'} className={form.intent === 'wanted' ? 'selected' : ''} onClick={() => field('intent', 'wanted')}><span className="seller-intent-icon"><Search size={24} /></span><span><strong>أبحث عن شيء</strong><small>أنشر طلبًا ويصلني العرض المناسب</small></span><span className="seller-radio">{form.intent === 'wanted' && <span />}</span></button></div><fieldset className="seller-fieldset"><legend>القسم الرئيسي <span>*</span></legend><div className="seller-category-grid">{categories.slice(1).map(category => { const Icon = categoryIcons[category.name as keyof typeof categoryIcons]; return <button key={category.name} type="button" className={form.category === category.name ? 'selected' : ''} aria-pressed={form.category === category.name} onClick={() => chooseCategory(category.name)}><Icon size={25} /><span>{category.name}</span>{form.category === category.name && <Check size={13} className="seller-category-check" />}</button>; })}</div>{error('category')}</fieldset>{form.category && <label className="seller-field">التصنيف الفرعي <span className="seller-required">*</span><select value={form.subcategory} onChange={event => chooseSubcategory(event.target.value)} aria-invalid={Boolean(errors.subcategory)} aria-describedby={errors.subcategory ? 'error-subcategory' : undefined}><option value="">اختر التصنيف الأنسب</option>{subcategories[form.category]?.filter(sub => getProfile(form.category, sub)).map(sub => <option key={sub}>{sub}</option>)}</select>{error('subcategory')}</label>}</div></section>
        <section id="ad-details" className="seller-form-panel ad-page-section" tabIndex={-1} aria-labelledby="ad-details-heading"><SectionHeading index={1} />
          {!profile && <div className="seller-fields"><p role="alert">اختر القسم والفرع أعلاه لعرض بيانات الإعلان والمواصفات المناسبة.</p><button type="button" className="button secondary" onClick={() => jumpToSection('classification')}>اختيار الفرع</button></div>}
          {profile && <div className="seller-fields">
            <div className="category-context"><Link href="/field-settings/">إعدادات الحقول التجريبية</Link><strong>{form.category} / {form.subcategory}</strong><button type="button" className="category-change-button" onClick={() => jumpToSection('classification')}>تغيير الفرع</button></div>
            <label className="seller-field"><span>عنوان الإعلان <span className="seller-required">*</span></span><input value={form.title} maxLength={90} placeholder={profile.example} onChange={event => field('title', event.target.value)} aria-invalid={Boolean(errors.title)} /><small>{form.title.length}/90</small>{error('title')}</label>
            <label className="seller-field"><span>وصف الإعلان <span className="seller-required">*</span></span><textarea value={form.description} maxLength={1200} rows={5} placeholder={profile.pricing === 'salary' ? 'وضّح المسؤوليات ومتطلبات الوظيفة وطريقة التقديم، دون بيانات شخصية حساسة.' : 'أضف التفاصيل التي لم تغطّها الحقول، وأي عيوب أو شروط مهمة.'} onChange={event => field('description', event.target.value)} aria-invalid={Boolean(errors.description)} /><small>لا تضع أرقام الهوية أو مستندات شخصية هنا · {form.description.length}/1200</small>{error('description')}</label>
            <label className="seller-field"><span>المدينة <span className="seller-required">*</span></span><select value={form.city} onChange={event => field('city', event.target.value)} aria-invalid={Boolean(errors.city)}><option value="">اختر المدينة</option>{cities.slice(1).map(city => <option key={city}>{city}</option>)}</select>{error('city')}</label>
            {showCondition && <fieldset className="seller-fieldset"><legend>{form.intent === 'wanted' ? 'الحالة المفضّلة (اختياري)' : 'حالة المعروض *'}</legend><div className="seller-condition-options">{['جديد', 'مستعمل', ...(form.intent === 'wanted' ? ['أي حالة'] : [])].map(condition => <button type="button" key={condition} className={form.condition === condition ? 'selected' : ''} aria-pressed={form.condition === condition} onClick={() => field('condition', condition)}>{form.condition === condition && <Check size={16} />}{condition}</button>)}</div>{error('condition')}</fieldset>}
            <CategoryDetails profile={profile} values={form.details} errors={errors} intent={form.intent} onChange={detail} />
            {showPrice && <label className="seller-field"><span>{form.intent === 'wanted' ? 'الميزانية' : form.details.purpose === 'للإيجار' ? 'قيمة الإيجار للدورية المختارة' : profile.pricing === 'property' ? 'سعر العقار الإجمالي' : profile.pricing === 'service' ? 'تكلفة الخدمة التقديرية' : profile.pricing === 'supplier' ? 'سعر وحدة البيع' : 'السعر'} {optionalPrice ? <small>(اختياري)</small> : <span className="seller-required">*</span>}</span><span className="seller-money-input"><input type="text" maxLength={16} inputMode="decimal" value={form.price} placeholder={optionalPrice ? 'حسب الاتفاق' : 'أدخل المبلغ'} onChange={event => field('price', event.target.value)} aria-invalid={Boolean(errors.price)} /><span>ر.س</span></span>{error('price')}</label>}
          </div>}
        </section>
        <section id="ad-photos" className="seller-form-panel ad-page-section" tabIndex={-1} aria-labelledby="ad-photos-heading" aria-busy={uploading}><SectionHeading index={2} /><div className="seller-fields"><input ref={photoInput} id="ad-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => { void uploadPhotos(event.target.files); }} /><button type="button" className="seller-upload" disabled={uploading || form.images.length >= 3} onClick={() => photoInput.current?.click()}><span><ImagePlus size={31} /></span><strong>{uploading ? 'جارٍ قراءة الصور…' : form.images.length >= 3 ? 'أضفت الحد الأقصى من الصور' : 'اختر صور إعلانك'}</strong><small>JPG، PNG، WebP · حتى 1 ميجابايت للصورة</small><b>{form.images.length} / 3 صور</b></button>{uploadError && <div className="seller-inline-error" role="alert">{uploadError}</div>}{Boolean(form.images.length) && <div className="seller-upload-grid">{form.images.map((src, index) => <div key={`${index}-${src.slice(-20)}`}><img src={src} alt={`صورة الإعلان ${index + 1}`} /><span>{index === 0 ? 'صورة الغلاف' : `صورة ${index + 1}`}</span><button type="button" disabled={uploading} title="حذف الصورة" aria-label={`حذف الصورة ${index + 1}`} onClick={() => field('images', form.images.filter((_, imageIndex) => imageIndex !== index))}><X size={17} /></button></div>)}</div>}<div className="seller-photo-tip"><Camera size={21} /><p>صوّر المنتج بإضاءة طبيعية ومن أكثر من زاوية، وأظهر حالته بوضوح. صورك تبقى في هذا المتصفح ضمن التجربة.</p></div></div></section>
        <section id="ad-review" className="seller-form-panel ad-page-section" tabIndex={-1} aria-labelledby="ad-review-heading"><SectionHeading index={3} /><div className="seller-review"><AdPreview ad={form} /><div className="seller-review-edits"><button type="button" onClick={() => jumpToSection('classification')}><Pencil size={15} />تعديل القسم</button><button type="button" onClick={() => jumpToSection('details')}><Pencil size={15} />تعديل التفاصيل</button><button type="button" onClick={() => jumpToSection('photos')}><Pencil size={15} />تعديل الصور</button></div><div className="seller-demo-note"><ShieldCheck size={21} /><span>بالضغط على «{editingId ? 'حفظ التعديلات التجريبية' : 'نشر تجريبي'}»، سيُحفظ الإعلان محليًا في لوحة البائع. لا توجد عملية نشر عامة أو دفع.</span></div>{publishError && <div className="seller-inline-error" role="alert">{publishError}</div>}</div>
        <div className="seller-form-footer"><button type="button" className="button secondary" onClick={saveNow} disabled={uploading}><FilePenLine size={17} />حفظ المسودة</button><span className="seller-save-state" aria-live="polite">{saveStatus === 'saved' ? <><CheckCircle2 size={15} />المسودة محفوظة</> : saveStatus === 'saving' ? 'جارٍ حفظ المسودة…' : saveStatus === 'failed' ? <button type="button" onClick={saveNow}>تعذر الحفظ · إعادة المحاولة</button> : 'تُحفظ مسودتك تلقائيًا'}</span><button type="button" className="button primary" disabled={uploading} onClick={publish}>{editingId ? 'حفظ التعديلات التجريبية' : 'نشر تجريبي'}<Check size={18} /></button></div>
        </section>
      </>}
    </div><aside className="seller-form-aside"><div className="seller-help-card"><span className="seller-help-icon"><Sparkles size={24} /></span><span className="seller-eyebrow">إعلان أفضل، فرص أكثر</span><h3>خلّ إعلانك يلفت النظر</h3><ul><li><CheckCircle2 size={18} /><span><strong>عنوان واضح ومختصر</strong>صف المعروض أو الفرصة وأهم ما يميّزها.</span></li><li><CheckCircle2 size={18} /><span><strong>تفاصيل خاصة بالفرع</strong>أكمل المواصفات المناسبة للمجال.</span></li><li><CheckCircle2 size={18} /><span><strong>صور حقيقية وواضحة</strong>أضف صوراً مناسبة إن كان نوع الإعلان يحتاجها.</span></li><li><CheckCircle2 size={18} /><span><strong>{profile?.pricing === 'salary' ? 'راتب ودورية واضحان' : 'سعر مناسب وواضح'}</strong>يساعد المهتم على اتخاذ قراره.</span></li></ul></div><div className="seller-privacy-card"><ShieldCheck size={23} /><h3>تعامل بوعي</h3><p>عاين المنتج وتحقق من تفاصيله قبل الاتفاق. لا تشارك رموز التحقق أو معلوماتك البنكية.</p><Link href="/#trust">نصائح البيع والشراء الآمن<ArrowLeft size={16} /></Link></div><div className="seller-local-note"><Clock3 size={17} /><p>تحتاج وقتًا أكثر؟ مسودتك تُحفظ في هذا المتصفح لتعود إليها متى أردت.</p></div></aside></div>
    <Modal open={discardOpen} onClose={() => setDiscardOpen(false)} title="بدء إعلان جديد؟"><p>سيتم استبدال المسودة الحالية بمسودة فارغة. الإعلان السابق المحفوظ في لوحة البائع لن يتأثر.</p><div className="seller-modal-actions"><button className="button secondary" type="button" onClick={() => setDiscardOpen(false)}>العودة للمسودة</button><button className="button primary" type="button" onClick={resetDraft}>بدء إعلان جديد</button></div></Modal>
  </div>;
}

export function SellerDashboard() {
  const [tab, setTab] = useState<'overview' | 'ads' | 'drafts'>('overview');
  const [ads, setAds] = useState<SellerAd[]>(initialAds);
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [filter, setFilter] = useState<'all' | AdStatus>('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<SellerAd | null>(null);
  const [promotion, setPromotion] = useState<SellerAd | null>(null);
  const [deleteDraftOpen, setDeleteDraftOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { const sync = () => { setAds(getAds()); setDraft(getDraft()); }; sync(); setHydrated(true); window.addEventListener('storage', sync); window.addEventListener('trbhh-seller-updated', sync); return () => { window.removeEventListener('storage', sync); window.removeEventListener('trbhh-seller-updated', sync); }; }, []);
  const active = ads.filter(ad => ad.status === 'active').length;
  const completed = ads.filter(ad => ad.status === 'sold').length;
  const filtered = ads.filter(ad => (filter === 'all' || ad.status === filter) && `${ad.title} ${ad.category} ${ad.city}`.includes(query.trim()));
  function updateStatus(ad: SellerAd, status: AdStatus) {
    const updated = ads.map(item => item.id === ad.id ? { ...item, status } : item);
    writeLocal(SELLER_ADS_KEY, updated);
    const stored = getAds().find(item => item.id === ad.id);
    if (stored?.status !== status) { notify('تعذر حفظ التغيير. جرّب مرة أخرى.'); return; }
    setAds(updated);
    notify(status === 'paused' ? 'أوقفت الإعلان في المعاينة. يمكنك إعادة تنشيطه.' : status === 'sold' ? 'وُضع الإعلان ضمن الإعلانات المكتملة.' : 'أُعيد تنشيط الإعلان التجريبي.');
  }
  function deleteDraft() { writeLocal(AD_DRAFT_KEY, null); if (!getDraft()) { setDraft(null); setDeleteDraftOpen(false); notify('حُذفت المسودة من هذا المتصفح.'); } }
  function adRows(items: SellerAd[]) {
    if (!items.length) return <div className="seller-empty-state"><Package size={34} /><h3>لا توجد إعلانات هنا بعد</h3><p>{query || filter !== 'all' ? 'جرّب كلمة بحث أخرى أو اعرض جميع الحالات.' : 'ابدأ بإعلانك الأول، وستجده في هذه المساحة.'}</p>{query || filter !== 'all' ? <button className="button secondary" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>عرض جميع الإعلانات</button> : <Link href="/ads/new/" className="button primary"><Plus size={17} />أضف إعلانًا</Link>}</div>;
    return <div className="seller-ad-list">{items.map(ad => <article key={ad.id} className="seller-ad-row"><button className="seller-row-picture" type="button" onClick={() => setPreview(ad)} aria-label={`معاينة ${ad.title}`}><AdPicture ad={ad} /></button><div className="seller-row-info"><div className="seller-inline"><span className={`seller-pill ${ad.status}`}><span />{statusLabels[ad.status]}</span><span className="seller-muted seller-row-kind">{ad.intent === 'wanted' ? 'طلب شراء' : ad.category}</span></div><button className="seller-ad-title" type="button" onClick={() => setPreview(ad)}>{ad.title}</button><strong>{priceText(ad)}</strong><span className="seller-inline seller-row-location"><MapPin size={14} />{ad.city}<span>·</span>{ad.id.startsWith('local-') ? 'أُضيف محليًا' : 'إعلان توضيحي'}</span></div><div className="seller-row-actions"><div><Link href={`/ads/new/?edit=${encodeURIComponent(ad.id)}`} className="seller-icon-button" title="تعديل الإعلان" aria-label={`تعديل ${ad.title}`}><Pencil size={17} /></Link><button type="button" className="seller-icon-button" title="معاينة الإعلان" aria-label={`فتح معاينة ${ad.title}`} onClick={() => setPreview(ad)}><Eye size={18} /></button><button type="button" disabled={!hydrated} className="seller-icon-button" title={ad.status === 'active' ? 'إيقاف الإعلان' : 'إعادة التنشيط'} aria-label={`${ad.status === 'active' ? 'إيقاف' : 'إعادة تنشيط'} ${ad.title}`} onClick={() => updateStatus(ad, ad.status === 'active' ? 'paused' : 'active')}>{ad.status === 'active' ? <Pause size={17} /> : <Play size={17} />}</button></div>{ad.status === 'active' ? <button type="button" className="seller-promote-button" onClick={() => setPromotion(ad)}><Sparkles size={15} />تمييز الإعلان</button> : <span className="seller-muted seller-row-status-note">{ad.status === 'sold' ? 'اكتمل هذا الإعلان' : 'يمكنك تفعيله مجددًا'}</span>}{ad.status !== 'sold' && <button type="button" disabled={!hydrated} className="seller-complete-ad" onClick={() => updateStatus(ad, 'sold')}>{ad.intent === 'wanted' ? 'تم العثور على المطلوب' : 'تم البيع / اكتمل'}</button>}</div></article>)}</div>;
  }
  return <div className="container seller-page seller-dashboard">
    <div className="seller-breadcrumb"><Link href="/">الرئيسية</Link><ChevronLeft size={14} /><span>لوحة البائع</span></div>
    <div className="seller-dashboard-layout"><aside className="seller-sidebar"><div className="seller-shop-profile"><span className="seller-avatar">د</span><h2>دار الأثاث<BadgeCheck size={19} /></h2><p>حساب بائع تجريبي</p><Link href="/store/dar/">معاينة المتجر<ArrowLeft size={15} /></Link></div><nav aria-label="أقسام لوحة البائع"><button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard size={19} />نظرة عامة</button><button type="button" className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}><ClipboardList size={19} />إعلاناتي<span>{ads.length}</span></button><button type="button" className={tab === 'drafts' ? 'active' : ''} onClick={() => setTab('drafts')}><FilePenLine size={19} />المسودات<span>{draft ? 1 : 0}</span></button><Link href="/messages/"><MessageCircle size={19} />الرسائل</Link><Link href="/account/credit/"><Wallet size={19} />الرصيد</Link><Link href="/store/dar/"><Store size={19} />متجري</Link></nav><div className="seller-sidebar-help"><CircleHelp size={23} /><strong>كل بداية تستحق الدعم</strong><p>تعرّف على خطوات البيع وأهم النصائح.</p><Link href="/#trust">نصائح البيع الآمن<ArrowLeft size={15} /></Link></div></aside>
      <div className="seller-dashboard-main"><div className="seller-page-head"><div><span className="seller-eyebrow">مساحة عملك في تربح</span><h1>{tab === 'overview' ? 'أهلًا بك، دار الأثاث' : tab === 'ads' ? 'إعلاناتك، في مكان واحد' : 'أكملها على مهلك'}</h1><p>{tab === 'overview' ? 'تابع إعلاناتك، وابقَ قريبًا من فرصتك القادمة.' : tab === 'ads' ? 'راجع إعلاناتك وعدّل تفاصيلها وتحكّم في حالتها.' : 'نحفظ آخر مسودة في هذا المتصفح لتعود إليها.'}</p></div><Link href="/ads/new/" className="button primary"><Plus size={19} />أضف إعلانًا</Link></div>
        {tab === 'overview' && <><div className="seller-metrics"><div><span className="seller-metric-icon"><ClipboardList size={21} /></span><span className="seller-muted">إعلانات نشطة</span><strong>{active}</strong><small>داخل المعاينة المحلية</small></div><div><span className="seller-metric-icon"><Eye size={21} /></span><span className="seller-muted">مشاهدات الإعلانات</span><strong>1,248</strong><small><TrendingUp size={13} />مؤشر توضيحي · ليس قياسًا فعليًا</small></div><div><span className="seller-metric-icon"><MessageCircle size={21} /></span><span className="seller-muted">محادثات جديدة</span><strong>12</strong><small>بيانات توضيحية للتصميم</small></div><div><span className="seller-metric-icon"><CheckCircle2 size={21} /></span><span className="seller-muted">إعلانات مكتملة</span><strong>{completed}</strong><small>حسب تغييراتك المحلية</small></div></div><div className="seller-dashboard-banner"><div><span className="seller-banner-eyebrow"><Sparkles size={17} />فرصة لتظهر بصورة أفضل</span><h2>إعلان مرتب. انطباع يدوم.</h2><p>حدّث صورك وتفاصيلك لتجعل قرار المشتري أسهل.</p><button type="button" onClick={() => setTab('ads')}>راجع إعلاناتك<ArrowLeft size={16} /></button></div><div className="seller-banner-art" aria-hidden="true"><span><Armchair size={66} strokeWidth={1.2} /></span><i><Check size={18} /></i><b><Sparkles size={21} /></b></div></div><div className="seller-content-heading"><div><h2>آخر إعلاناتك</h2><p>نظرة سريعة على ما تعرضه الآن.</p></div><button type="button" onClick={() => setTab('ads')}>عرض الكل<ArrowLeft size={16} /></button></div><section className="seller-list-card">{adRows(ads.slice(0, 3))}</section><div className="seller-bottom-cards"><Link href="/messages/"><span><MessageCircle size={23} /></span><div><h3>كل اتفاق يبدأ بمحادثة</h3><p>اطّلع على صندوق الرسائل التجريبي.</p></div><ArrowLeft size={19} /></Link><Link href="/store/dar/"><span><Store size={23} /></span><div><h3>متجرك، واجهتك الخاصة</h3><p>شاهد كيف تظهر إعلاناتك للزوار.</p></div><ArrowLeft size={19} /></Link></div></>}
        {tab === 'ads' && <section className="seller-list-card"><div className="seller-list-toolbar"><div className="seller-status-filters" aria-label="تصفية حالات الإعلان">{(['all', 'active', 'paused', 'sold'] as const).map(value => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'الكل' : statusLabels[value]}<span>{value === 'all' ? ads.length : ads.filter(ad => ad.status === value).length}</span></button>)}</div><label className="seller-ad-search"><Search size={18} /><input aria-label="البحث في إعلاناتي" value={query} placeholder="ابحث في إعلاناتك…" onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="مسح البحث" onClick={() => setQuery('')}><X size={15} /></button>}</label></div>{adRows(filtered)}</section>}
        {tab === 'drafts' && <section className="seller-list-card">{draft ? <div className="seller-draft-card"><AdPicture ad={draft.form} className="seller-draft-cover" /><div><span className="seller-pill gold"><FilePenLine size={13} />مسودة محفوظة</span><h2>{draft.form.title || 'إعلان جديد بانتظار التفاصيل'}</h2><p>{draft.form.category || 'لم يُحدد القسم بعد'} · أكمل البيانات في صفحة واحدة</p><span className="seller-muted">آخر حفظ: {new Date(draft.savedAt).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })}</span><div className="seller-modal-actions"><Link href={draft.editingId ? `/ads/new/?edit=${encodeURIComponent(draft.editingId)}` : '/ads/new/'} className="button primary">إكمال المسودة<ArrowLeft size={16} /></Link><button type="button" className="button secondary" onClick={() => setDeleteDraftOpen(true)}><Trash2 size={16} />حذف</button></div></div></div> : <div className="seller-empty-state"><FilePenLine size={37} /><h3>مساحتك للأفكار القادمة</h3><p>ابدأ إعلانًا وسيُحفظ تلقائيًا هنا حتى تكون جاهزًا لإكماله.</p><Link href="/ads/new/" className="button primary"><Plus size={17} />ابدأ إعلانًا</Link></div>}</section>}
        <p className="seller-dashboard-note"><ShieldCheck size={16} />حساب وبيانات تجريبية. تغييرات الإعلانات والمسودات تُحفظ على هذا المتصفح فقط.</p>
      </div></div>
    <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="معاينة الإعلان التجريبي">{preview && <><AdPreview ad={preview} /><div className="seller-modal-actions"><Link className="button primary" href={`/ads/new/?edit=${encodeURIComponent(preview.id)}`}>تعديل الإعلان<Pencil size={16} /></Link><button className="button secondary" type="button" onClick={() => setPreview(null)}>إغلاق المعاينة</button></div></>}</Modal>
    <Modal open={Boolean(promotion)} onClose={() => setPromotion(null)} title="تمييز الإعلان"><div className="seller-promotion-modal"><span><Sparkles size={31} /></span><h3>امنح إعلانك ظهورًا إضافيًا</h3><p>ستتيح هذه المساحة اختيار مدة التمييز ومواضع الظهور. تفاصيل الباقات والأسعار تُضبط لاحقًا قبل إطلاق الخدمة.</p>{promotion && <div className="seller-promotion-item"><AdPicture ad={promotion} /><strong>{promotion.title}</strong></div>}<div className="seller-demo-note"><ShieldCheck size={19} /><span>معاينة للميزة؛ لا توجد رسوم أو عملية دفع أو تفعيل تمييز.</span></div><button type="button" className="button primary" onClick={() => setPromotion(null)}>فهمت، العودة لإعلاناتي</button></div></Modal>
    <Modal open={deleteDraftOpen} onClose={() => setDeleteDraftOpen(false)} title="حذف المسودة؟"><p>ستُحذف هذه المسودة من المتصفح. الإعلانات المحفوظة في لوحتك ستبقى كما هي.</p><div className="seller-modal-actions"><button className="button secondary" type="button" onClick={() => setDeleteDraftOpen(false)}>احتفظ بها</button><button className="button primary" type="button" onClick={deleteDraft}>حذف المسودة</button></div></Modal>
  </div>;
}

/**
 * محرّك التخطيط الديناميكي للصفحة الرئيسية التجارية (كتالوج سلة المعتمد).
 *
 * قواعد ثابتة قابلة للاختبار — لا وصول لقاعدة بيانات ولا React هنا، فقط منطق:
 *   • القسم بلا عناصر (٠) يُخفى كليّاً — لا غلاف فارغ ولا عنوان معلّق.
 *   • التخطيط (عدد الأعمدة وشكل البطاقة) يتغيّر تلقائيّاً حسب عدد العناصر:
 *       ١ → بطاقة مميّزة كبيرة، ٢ → عمودان، ٣ → ثلاثة، ٤ → أربعة،
 *       ٥–٦ → شبكة ٣، ٧+ → شبكة كثيفة ٤ (بحدٍّ أقصى للعرض).
 *   • فاصل بصري قبل كل قسم عدا الأول، وخانة إعلان ديناميكية كل N أقسام.
 */

export type HomeCardVariant = 'feature' | 'grid';

export type HomeLayout = {
  /** القسم بلا عناصر → لا يُصيَّر إطلاقاً. */
  hidden: boolean;
  /** أعمدة سطح المكتب. */
  columns: 1 | 2 | 3 | 4;
  /** أعمدة الجوال. */
  mobileColumns: 1 | 2;
  /** شكل البطاقة: مميّزة كبيرة (لعنصر واحد) أو شبكة. */
  variant: HomeCardVariant;
  /** أقصى عدد عناصر تُعرض في هذا القسم (منع استعلامات/عرض غير محدود). */
  limit: number;
};

/** أقصى عدد عناصر يُعرض في أي قسم مهما كثرت (حماية من العرض غير المحدود). */
export const HOME_SECTION_CAP = 20;

/** يختار التخطيط المناسب لعدد عناصر معطى (٠/١/٢/٣/٤/٦/٢٠ …). */
export function pickHomeLayout(count: number): HomeLayout {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n === 0) return { hidden: true, columns: 1, mobileColumns: 1, variant: 'grid', limit: 0 };
  if (n === 1) return { hidden: false, columns: 1, mobileColumns: 1, variant: 'feature', limit: 1 };
  if (n === 2) return { hidden: false, columns: 2, mobileColumns: 2, variant: 'grid', limit: 2 };
  if (n === 3) return { hidden: false, columns: 3, mobileColumns: 2, variant: 'grid', limit: 3 };
  if (n === 4) return { hidden: false, columns: 4, mobileColumns: 2, variant: 'grid', limit: 4 };
  if (n <= 6) return { hidden: false, columns: 3, mobileColumns: 2, variant: 'grid', limit: 6 };
  return { hidden: false, columns: 4, mobileColumns: 2, variant: 'grid', limit: Math.min(n, HOME_SECTION_CAP) };
}

export type HomeSectionKind = 'products' | 'stores' | 'ads' | 'campaign';

/**
 * شكل عرض القسم البصري (تنويع التخطيط، لا يُغيّر منطق الإخفاء/الحدّ):
 *   • grid — شبكة عادية تتكيّف مع العدد.
 *   • spotlight — بطاقة كبيرة أولى + بطاقات صغيرة بجانبها.
 *   • carousel — صفّ أفقي قابل للسحب (مثالي للجوال).
 */
export type HomeSectionDisplay = 'grid' | 'spotlight' | 'carousel';

/** لون/طابع القسم البصري ليتمايز الموردون عن البائعين الموثوقين عن عروض الأعضاء. */
export type HomeSectionAccent = 'gold' | 'navy' | 'orange';

export type HomeSectionInput<T> = {
  id: string;
  title: string;
  kind: HomeSectionKind;
  items: readonly T[];
  /** يُبقي القسم دائماً وإن كان ذا عنصر واحد (مثل حملة مؤقّتة) — لا يغيّر إخفاء الفارغ. */
  keepSingle?: boolean;
  /** شكل العرض البصري (افتراضي grid) — يُمرَّر كما هو للمُصيِّر. */
  display?: HomeSectionDisplay;
  /** طابع لوني للقسم لتمييزه بصريّاً. */
  accent?: HomeSectionAccent;
};

export type ComposedHomeSection<T> = {
  id: string;
  title: string;
  kind: HomeSectionKind;
  items: T[];
  layout: HomeLayout;
  /** شكل العرض البصري الفعلي بعد التركيب. */
  display: HomeSectionDisplay;
  /** طابع لوني للقسم. */
  accent: HomeSectionAccent;
  /** فاصل بصري قبل هذا القسم (لكل قسم عدا الأول المعروض). */
  dividerBefore: boolean;
  /** خانة إعلان ديناميكية بعد هذا القسم. */
  adSlotAfter: boolean;
};

export type ComposeHomeOptions = {
  /** أدرج خانة إعلان ديناميكية بعد كل N أقسام معروضة (٠/غير معرّف = بلا إعلانات). */
  adEvery?: number;
};

/**
 * يركّب الصفحة الرئيسية: يُسقط الأقسام الفارغة، ويحدّد التخطيط لكل قسم من عدد
 * عناصره، ويقصّها للحدّ الأقصى، ويوزّع الفواصل وخانات الإعلان الديناميكية.
 */
export function composeHome<T>(
  sections: readonly HomeSectionInput<T>[],
  opts: ComposeHomeOptions = {},
): ComposedHomeSection<T>[] {
  const adEvery = opts.adEvery && opts.adEvery > 0 ? Math.floor(opts.adEvery) : 0;
  const visible = sections.filter((s) => (s.items?.length ?? 0) > 0);
  return visible.map((s, i) => {
    const layout = pickHomeLayout(s.items.length);
    // الـcarousel/spotlight يعرض حتى الحدّ الأقصى العام، لا حدّ الشبكة المتكيّف.
    const display: HomeSectionDisplay = s.display ?? 'grid';
    const limit = display === 'grid' ? layout.limit : Math.min(s.items.length, HOME_SECTION_CAP);
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      items: s.items.slice(0, limit),
      layout,
      display,
      accent: s.accent ?? 'gold',
      dividerBefore: i > 0,
      adSlotAfter: adEvery > 0 && (i + 1) % adEvery === 0,
    };
  });
}

/** أصناف Tailwind لأعمدة الشبكة حسب التخطيط (ثابتة كي لا يُقصّها الـpurge). */
export function homeGridClass(layout: HomeLayout): string {
  if (layout.variant === 'feature') return 'grid grid-cols-1';
  const mobile = layout.mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const desktop = ({ 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as const)[layout.columns];
  return `grid ${mobile} ${desktop}`;
}

import { describe, expect, it } from 'vitest';
import { pickHomeLayout, composeHome, homeGridClass, HOME_SECTION_CAP, type HomeSectionInput } from '@/lib/commerce/home-layout';

describe('pickHomeLayout — التخطيط حسب عدد العناصر', () => {
  it('٠ عناصر → مخفي كليّاً', () => {
    const l = pickHomeLayout(0);
    expect(l.hidden).toBe(true);
    expect(l.limit).toBe(0);
  });

  it('١ عنصر → بطاقة مميّزة بعمود واحد', () => {
    const l = pickHomeLayout(1);
    expect(l.hidden).toBe(false);
    expect(l.variant).toBe('feature');
    expect(l.columns).toBe(1);
    expect(l.limit).toBe(1);
  });

  it('٢/٣/٤ → أعمدة مطابقة للعدد كشبكة', () => {
    expect(pickHomeLayout(2)).toMatchObject({ hidden: false, columns: 2, variant: 'grid', limit: 2 });
    expect(pickHomeLayout(3)).toMatchObject({ hidden: false, columns: 3, variant: 'grid', limit: 3 });
    expect(pickHomeLayout(4)).toMatchObject({ hidden: false, columns: 4, variant: 'grid', limit: 4 });
  });

  it('٦ → شبكة ٣ بحدّ ٦', () => {
    expect(pickHomeLayout(6)).toMatchObject({ hidden: false, columns: 3, variant: 'grid', limit: 6 });
  });

  it('٢٠ (وأكثر) → شبكة كثيفة ٤ بحدّ أقصى ثابت', () => {
    expect(pickHomeLayout(20)).toMatchObject({ hidden: false, columns: 4, limit: HOME_SECTION_CAP });
    expect(pickHomeLayout(999).limit).toBe(HOME_SECTION_CAP);
  });

  it('مدخلات غير صالحة → تُعامل كصفر (مخفي)', () => {
    expect(pickHomeLayout(NaN).hidden).toBe(true);
    expect(pickHomeLayout(-5).hidden).toBe(true);
    expect(pickHomeLayout(2.9).limit).toBe(2);
  });
});

function section(id: string, n: number, extra: Partial<HomeSectionInput<number>> = {}): HomeSectionInput<number> {
  return { id, title: id, kind: 'products', items: Array.from({ length: n }, (_, i) => i), ...extra };
}

describe('composeHome — إسقاط الفارغ + الفواصل + خانات الإعلان', () => {
  it('يُسقط الأقسام الفارغة ويحتفظ بالترتيب', () => {
    const out = composeHome([section('a', 0), section('b', 3), section('c', 0), section('d', 2)]);
    expect(out.map((s) => s.id)).toEqual(['b', 'd']);
  });

  it('فاصل قبل كل قسم عدا الأول المعروض', () => {
    const out = composeHome([section('empty', 0), section('first', 2), section('second', 4)]);
    expect(out[0].dividerBefore).toBe(false); // «first» هو الأول المعروض رغم وجود فارغ قبله
    expect(out[1].dividerBefore).toBe(true);
  });

  it('يقصّ العناصر إلى حدّ التخطيط', () => {
    const out = composeHome([section('big', 50)]);
    expect(out[0].items).toHaveLength(HOME_SECTION_CAP);
    expect(out[0].layout.columns).toBe(4);
  });

  it('خانة إعلان ديناميكية كل N أقسام معروضة', () => {
    const out = composeHome([section('a', 1), section('b', 1), section('c', 1), section('d', 1)], { adEvery: 2 });
    expect(out.map((s) => s.adSlotAfter)).toEqual([false, true, false, true]);
  });

  it('بلا adEvery → لا خانات إعلان', () => {
    const out = composeHome([section('a', 2), section('b', 2)]);
    expect(out.every((s) => s.adSlotAfter === false)).toBe(true);
  });

  it('قائمة فارغة تماماً → لا شيء', () => {
    expect(composeHome([section('a', 0), section('b', 0)])).toEqual([]);
  });
});

describe('homeGridClass — أصناف ثابتة لا يقصّها الـpurge', () => {
  it('مميّزة → عمود واحد', () => {
    expect(homeGridClass(pickHomeLayout(1))).toBe('grid grid-cols-1');
  });
  it('أربعة → عمودان بالجوال وأربعة بالكمبيوتر', () => {
    expect(homeGridClass(pickHomeLayout(4))).toContain('grid-cols-2');
    expect(homeGridClass(pickHomeLayout(4))).toContain('lg:grid-cols-4');
  });
});

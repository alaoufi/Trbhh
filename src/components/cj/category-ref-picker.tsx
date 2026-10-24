'use client';
import { useState } from 'react';

/**
 * منتقي القسم الموحّد بقائمتين متتاليتين: قائمة للقسم الرئيسي وأخرى للفرعي
 * (تُصفّى حسب الرئيسي). يكتب القيمة المركّبة «catId:subId» في حقل مخفي باسم categoryRef
 * ليحفظها الإجراء نفسه (نفس أقسام إعلانات تربح). الفرعي اختياري.
 */
export function CategoryRefPicker({
  categories,
  subcategories,
  currentCategoryId,
  currentSubcategoryId,
  selectClassName,
}: {
  categories: { id: number; name: string }[];
  subcategories: { id: number; name: string; categoryId: number }[];
  currentCategoryId: number;
  currentSubcategoryId: number;
  selectClassName: string;
}) {
  const [catId, setCatId] = useState<number>(currentCategoryId || 0);
  const [subId, setSubId] = useState<number>(currentSubcategoryId || 0);
  const subs = catId ? subcategories.filter((s) => s.categoryId === catId) : [];
  const ref = catId > 0 ? `${catId}:${subId > 0 ? subId : ''}` : '';

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="categoryRef" value={ref} />
      <label className="block">
        <span className="mb-1 block text-[13px] font-bold text-slate-700">القسم الرئيسي</span>
        <select
          className={selectClassName}
          value={catId || ''}
          onChange={(e) => { setCatId(Number(e.target.value) || 0); setSubId(0); }}
        >
          <option value="">— اختر القسم —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {subs.length > 0 && <label className="block">
        <span className="mb-1 block text-[13px] font-bold text-slate-700">القسم الفرعي</span>
        <select
          className={selectClassName}
          value={subId || ''}
          disabled={!catId || subs.length === 0}
          onChange={(e) => setSubId(Number(e.target.value) || 0)}
        >
          <option value="">{!catId ? '— اختر القسم الرئيسي أولاً —' : subs.length === 0 ? '— لا فروع —' : '— بلا قسم فرعي —'}</option>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>}
    </div>
  );
}

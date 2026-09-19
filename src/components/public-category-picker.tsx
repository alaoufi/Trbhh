'use client';

import { useState } from 'react';

export type PublicCategoryOption = { name: string; subcategories: string[] };
export function PublicCategoryPicker({categories, category = '', subcategory = '', className}: {
  categories: PublicCategoryOption[]; category?: string; subcategory?: string; className?: string;
}) {
  const initial = categories.find(item => item.name === category);
  const [selected, setSelected] = useState(initial?.name || '');
  const [child, setChild] = useState(initial?.subcategories.includes(subcategory) ? subcategory : '');
  const children = categories.find(item => item.name === selected)?.subcategories || [];
  return <>
    <label className="space-y-1 text-xs font-semibold text-foreground">القسم الرئيسي
      <select aria-label="القسم الرئيسي" name="category" value={selected} onChange={event => {setSelected(event.target.value);setChild('');}} className={className}>
        <option value="">كل الأقسام</option>
        {categories.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
      </select>
    </label>
    <label className="space-y-1 text-xs font-semibold text-foreground">القسم الفرعي
      <select aria-label="القسم الفرعي" name="subcategory" value={child} onChange={event => setChild(event.target.value)} disabled={!selected} className={className}>
        <option value="">{selected ? 'كل الفروع' : 'اختر القسم الرئيسي أولاً'}</option>
        {children.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  </>;
}

'use client';
import { useState } from 'react';
import { Sparkles, Search } from 'lucide-react';
import { smartSearchAction } from '@/app/search/actions';

// حقل البحث الذكي بالكلام الطبيعي — يكتب المستخدم جملة، ويتولّى الخادم تحليلها.
const EXAMPLES = [
  'دور للبيع في حي النرجس بالرياض ٣ غرف بأقل من مليون',
  'شقة للإيجار بالملقا غرفتين مفروشة',
  'فيلا بحوش ومسبح في جدة تحت ٢ مليون',
  'أرض تجارية في الخبر مساحة ٥٠٠ متر',
];

export function SmartSearch() {
  const [v, setV] = useState('');
  return (
    <form action={smartSearchAction} className="card-3d space-y-2 rounded-xl border-2 border-primary/20 p-3">
      <div className="flex items-center gap-1.5 text-sm font-extrabold text-primary">
        <Sparkles className="h-4 w-4" /> بحث ذكي — اكتب طلبك بالعربي كما تنطقه
      </div>
      <div className="flex gap-2">
        <input
          name="smart" value={v} onChange={(e) => setV(e.target.value)}
          placeholder="مثال: دور للبيع في حي النرجس بالرياض ٣ غرف بأقل من مليون"
          className="h-11 flex-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button type="submit" className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-extrabold text-white shadow-sm transition hover:opacity-90">
          <Search className="h-4 w-4" /> بحث
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => setV(ex)}
            className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary/80 hover:bg-primary/10">
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}

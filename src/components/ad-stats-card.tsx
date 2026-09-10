'use client';
import { useState } from 'react';
import { Eye, Phone, Heart, Calendar } from 'lucide-react';
import type { AdPeriod, AdPeriodStats } from '@/lib/analytics';

interface AdStats extends AdPeriodStats {
  createdAt: string | null;
  platformUntil?: string | null;
  featuredUntil?: string | null;
}

export function AdStatsCard({ stats }: { stats: AdStats }) {
  const [period, setPeriod] = useState<AdPeriod>('7d');
  const selected = stats.periods[period];
  const items = [
    { icon: Eye, label: 'مشاهدات', value: selected.views, color: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: Phone, label: 'ضغطات التواصل', value: selected.contacts, color: 'text-green-600', bg: 'bg-green-50' },
    { icon: Heart, label: 'المفضلة الحالية', value: stats.favorites, color: 'text-red-600', bg: 'bg-red-50' },
  ];
  const day = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh' }) : 'غير مسجّل';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="فترة الإحصاءات">
        {([{ key: '7d', label: '7 أيام' }, { key: '30d', label: '30 يوم' }, { key: 'all', label: 'الكل' }] as const).map((p) => (
          <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)} className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition ${period === p.key ? 'border-primary bg-primary text-white' : 'border-primary/25 bg-white text-foreground hover:border-primary/50'}`}>{p.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-live="polite">
        {items.map((item) => (
          <div key={item.label} className={`rounded-xl ${item.bg} p-3 text-center`}>
            <item.icon className={`mx-auto h-5 w-5 ${item.color}`} />
            <p className={`mt-1 text-lg font-extrabold ${item.color}`}>{item.value.toLocaleString('en-US')}</p>
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">المشاهدات والتواصل حسب الفترة بتوقيت السعودية؛ المفضلة عددها الحالي. المشاهدات القديمة غير المؤرخة ضمن «الكل» فقط.</p>
      <div className="rounded-lg border-2 border-primary/15 bg-primary/5 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span>نُشر: <b>{day(stats.createdAt)}</b></span>
          {stats.platformUntil && <span> · نهاية عرض تربح: <b>{day(stats.platformUntil)}</b></span>}
          {stats.featuredUntil && <span> · نهاية التمييز: <b>{day(stats.featuredUntil)}</b></span>}
        </div>
      </div>
    </div>
  );
}

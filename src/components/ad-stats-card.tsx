'use client';
import { useState } from 'react';
import { Eye, Phone, MessageSquare, Heart, TrendingUp, Calendar } from 'lucide-react';

interface AdStats {
  views: number;
  contacts: number;
  messages: number;
  favorites: number;
  createdAt: string;
  expiresAt: string;
}

export function AdStatsCard({ stats }: { stats: AdStats }) {
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('7d');

  const items = [
    { icon: Eye, label: 'مشاهدات', value: stats.views, color: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: Phone, label: 'اتصالات', value: stats.contacts, color: 'text-green-600', bg: 'bg-green-50' },
    { icon: MessageSquare, label: 'رسائل', value: stats.messages, color: 'text-purple-600', bg: 'bg-purple-50' },
    { icon: Heart, label: 'مفضلة', value: stats.favorites, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex gap-2">
        {([
          { key: '7d', label: '7 أيام' },
          { key: '30d', label: '30 يوم' },
          { key: 'all', label: 'الكل' },
        ] as const).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition ${
              period === p.key
                ? 'border-primary bg-primary text-white'
                : 'border-primary/25 bg-white text-foreground hover:border-primary/50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className={`rounded-xl ${item.bg} p-3 text-center`}>
            <item.icon className={`mx-auto h-5 w-5 ${item.color}`} />
            <p className={`mt-1 text-lg font-extrabold ${item.color}`}>{item.value.toLocaleString()}</p>
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="rounded-lg border-2 border-primary/15 bg-primary/5 p-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-medium">
            نُشر: <b>{new Date(stats.createdAt).toLocaleDateString('ar-SA')}</b>
            {' · '}
            ينتهي: <b>{new Date(stats.expiresAt).toLocaleDateString('ar-SA')}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

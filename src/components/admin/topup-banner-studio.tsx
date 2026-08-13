'use client';

import { useEffect, useRef, useState } from 'react';
import { TopupCampaignBannerView } from '@/components/topup-campaign-banner-view';
import { TOPUP_BANNER_HEIGHTS, TOPUP_BANNER_TEMPLATES, TOPUP_BANNER_WIDTHS, TOPUP_CAMPAIGN_DESIGN_SCHEDULING_NOTICE, type TopupCampaignPresentation } from '@/lib/topup-campaign-presentation';

const defaultTiers = [{ amount: 100, bonus: 10 }, { amount: 200, bonus: 25 }, { amount: 300, bonus: 40 }];

export function TopupBannerStudio() {
  const root = useRef<HTMLElement>(null);
  const [presentation, setPresentation] = useState<TopupCampaignPresentation>({ template: 'heritage', width: 'full', height: 'medium' });
  const [tiers, setTiers] = useState(defaultTiers);

  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form) return;
    const read = () => {
      const amounts = [...form.querySelectorAll<HTMLInputElement>('input[name="tierAmount"]')];
      const bonuses = [...form.querySelectorAll<HTMLInputElement>('input[name="tierBonus"]')];
      const next = amounts.map((input, i) => ({ amount: Number(input.value) || 0, bonus: Number(bonuses[i]?.value) || 0 })).filter((tier) => tier.amount > 0 && tier.bonus > 0);
      setTiers(next.length ? next : [{ amount: 100, bonus: 10 }]);
    };
    form.addEventListener('input', read);
    return () => form.removeEventListener('input', read);
  }, []);

  return (
    <section ref={root} className="space-y-3 rounded-xl border-2 border-sky-200 bg-sky-50/50 p-3">
      <div>
        <h3 className="font-extrabold text-sky-900">🎨 تصميم البانر</h3>
        <p className="text-[11px] text-muted-foreground">غيّر التصميم والمقاس وشاهد النتيجة مباشرة هنا قبل النشر.</p>
      </div>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] font-bold text-amber-900">{TOPUP_CAMPAIGN_DESIGN_SCHEDULING_NOTICE}</p>
      <label className="block text-xs font-bold text-sky-900">
        تصميم البانر
        <select name="bannerTemplate" defaultValue="heritage" onChange={(event) => setPresentation((current) => ({ ...current, template: event.currentTarget.value as TopupCampaignPresentation['template'] }))} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">
          {TOPUP_BANNER_TEMPLATES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-bold text-sky-900">
          عرض البانر
          <select name="bannerWidth" defaultValue="full" onChange={(event) => setPresentation((current) => ({ ...current, width: event.currentTarget.value as TopupCampaignPresentation['width'] }))} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">
            {TOPUP_BANNER_WIDTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-sky-900">
          ارتفاع البانر
          <select name="bannerHeight" defaultValue="medium" onChange={(event) => setPresentation((current) => ({ ...current, height: event.currentTarget.value as TopupCampaignPresentation['height'] }))} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">
            {TOPUP_BANNER_HEIGHTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-xl border-2 border-amber-200 bg-white p-2">
        <div className="mb-2 flex items-center justify-between"><b className="text-xs text-slate-800">المعاينة المباشرة</b><span className="text-[10px] font-bold text-amber-700">النجوم والتدرج واللمعة تظهر كما ستكون للعضو</span></div>
        <TopupCampaignBannerView tiers={tiers} presentation={presentation} preview />
      </div>
    </section>
  );
}

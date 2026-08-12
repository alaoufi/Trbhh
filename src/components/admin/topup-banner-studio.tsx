'use client';
import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { TopupCampaignBannerView } from '@/components/topup-campaign-banner-view';
import { TOPUP_BANNER_LAYOUTS, TOPUP_BANNER_SIZES, TOPUP_BANNER_TEMPLATES, type TopupCampaignPresentation } from '@/lib/topup-campaign-presentation';

export function TopupBannerStudio() {
  const root = useRef<HTMLElement>(null);
  const [presentation, setPresentation] = useState<TopupCampaignPresentation>({ template: 'heritage', layout: 'ribbon', size: 'standard' });
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [tiers, setTiers] = useState([{ amount: 100, bonus: 10 }, { amount: 200, bonus: 25 }, { amount: 300, bonus: 40 }]);
  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form) return;
    const read = () => {
      const amounts = [...form.querySelectorAll<HTMLInputElement>('input[name="tierAmount"]')];
      const bonuses = [...form.querySelectorAll<HTMLInputElement>('input[name="tierBonus"]')];
      const next = amounts.map((input, index) => ({ amount: Number(input.value) || 0, bonus: Number(bonuses[index]?.value) || 0 })).filter((tier) => tier.amount > 0 && tier.bonus > 0);
      setTiers(next.length ? next : [{ amount: 100, bonus: 10 }]);
    };
    form.addEventListener('input', read);
    return () => form.removeEventListener('input', read);
  }, []);
  const choose = <K extends keyof TopupCampaignPresentation>(key: K, value: TopupCampaignPresentation[K]) => setPresentation((p) => ({ ...p, [key]: value }));
  return <section ref={root} className="space-y-3 rounded-xl border-2 border-sky-200 bg-sky-50/50 p-3"><div><h3 className="font-extrabold text-sky-900">🎨 استديو تصميم البانر</h3><p className="text-[11px] text-muted-foreground">اختر التصميم ثم راجعه في موضعه الفعلي قبل النشر. هذه الخيارات آمنة ومتجاوبة.</p></div><input type="hidden" name="bannerTemplate" value={presentation.template} /><input type="hidden" name="bannerLayout" value={presentation.layout} /><input type="hidden" name="bannerSize" value={presentation.size} /><OptionGrid label="الألوان والتصاميم" items={TOPUP_BANNER_TEMPLATES} current={presentation.template} onChoose={(v) => choose('template', v as TopupCampaignPresentation['template'])} /><OptionGrid label="أسلوب ترتيب المحتوى" items={TOPUP_BANNER_LAYOUTS} current={presentation.layout} onChoose={(v) => choose('layout', v as TopupCampaignPresentation['layout'])} /><OptionGrid label="ارتفاع البانر" items={TOPUP_BANNER_SIZES} current={presentation.size} onChoose={(v) => choose('size', v as TopupCampaignPresentation['size'])} /><div className="rounded-xl border bg-white p-2"><div className="mb-2 flex items-center justify-between"><b className="text-xs text-slate-800">معاينة في مكانها الفعلي</b><span className="flex gap-1"><button type="button" onClick={() => setDevice('mobile')} className={`rounded p-1 ${device === 'mobile' ? 'bg-primary text-white' : 'bg-slate-100'}`} aria-label="عرض الجوال"><Smartphone className="h-4 w-4" /></button><button type="button" onClick={() => setDevice('desktop')} className={`rounded p-1 ${device === 'desktop' ? 'bg-primary text-white' : 'bg-slate-100'}`} aria-label="عرض الكمبيوتر"><Monitor className="h-4 w-4" /></button></span></div><div className={`mx-auto overflow-hidden rounded-xl border bg-slate-50 p-2 shadow-inner ${device === 'mobile' ? 'max-w-[390px]' : 'max-w-4xl'}`}><div className="mb-2 flex h-9 items-center justify-between rounded-md bg-[#041632] px-3 text-[10px] font-bold text-amber-300"><span>تربح</span><span>الرئيسية · المتاجر · محفظتي</span></div><TopupCampaignBannerView tiers={tiers} presentation={presentation} preview /><div className="mt-3 h-16 rounded-lg border bg-white p-2 text-[10px] text-slate-400">يهمك الآن — تظهر الإعلانات والمحتوى هنا بعد البانر.</div></div></div></section>;
}
function OptionGrid({ label, items, current, onChoose }: { label: string; items: readonly { key: string; label: string }[]; current: string; onChoose: (v: string) => void }) { return <div><p className="mb-1 text-xs font-bold text-sky-900">{label}</p><div className="flex flex-wrap gap-1.5">{items.map((item) => <button key={item.key} type="button" onClick={() => onChoose(item.key)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${current === item.key ? 'border-primary bg-primary text-white' : 'border-sky-200 bg-white text-sky-900'}`}>{item.label}</button>)}</div></div>; }

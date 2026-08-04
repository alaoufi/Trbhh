'use client';
import { useState } from 'react';
import { Calculator } from 'lucide-react';

// حاسبة تمويل عقاري تقديرية (نموذج مرابحة/تقسيط شرعي — «نسبة ربح» لا «فائدة»).
// كل الحساب في المتصفح، بلا خادم. الغرض: تخطيط تقريبي يجذب المشتري.
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function MortgageCalculator({ price }: { price: number }) {
  const [downPct, setDownPct] = useState(10); // الدفعة الأولى %
  const [years, setYears] = useState(20); // مدة التمويل
  const [profit, setProfit] = useState(4); // نسبة الربح السنوية %

  const down = Math.round((price * downPct) / 100);
  const financed = Math.max(0, price - down);
  const r = profit / 100 / 12; // معدل الربح الشهري
  const n = Math.max(1, years * 12);
  const monthly = r > 0 ? (financed * r) / (1 - Math.pow(1 + r, -n)) : financed / n;
  const total = monthly * n + down;

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${strong ? 'bg-primary text-white' : 'bg-secondary/50'}`}>
      <span className={`text-[13px] ${strong ? 'font-extrabold' : 'font-bold text-foreground/70'}`}>{label}</span>
      <span className={`font-mono ${strong ? 'text-base font-extrabold' : 'text-sm font-bold text-primary'}`} dir="ltr">{value}</span>
    </div>
  );

  const Slider = ({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) => (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-[13px] font-bold">
        <span>{label}</span>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-primary" dir="ltr">{value}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary" />
    </label>
  );

  return (
    <div className="card-3d space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-primary">
        <Calculator className="h-5 w-5" />
        <h3 className="text-sm font-extrabold">حاسبة التمويل العقاري <span className="font-normal text-muted-foreground">(تقديري)</span></h3>
      </div>
      <div className="space-y-3">
        <Slider label="الدفعة الأولى" value={downPct} min={5} max={80} step={5} suffix="٪" onChange={setDownPct} />
        <Slider label="مدة التمويل" value={years} min={1} max={30} step={1} suffix=" سنة" onChange={setYears} />
        <Slider label="نسبة الربح السنوية" value={profit} min={1} max={12} step={0.5} suffix="٪" onChange={setProfit} />
      </div>
      <div className="space-y-1.5">
        <Row label="الدفعة الأولى" value={`${fmt(down)} ر.س`} />
        <Row label="مبلغ التمويل" value={`${fmt(financed)} ر.س`} />
        <Row label="القسط الشهري التقديري" value={`${fmt(monthly)} ر.س`} strong />
        <Row label="إجمالي المبلغ المسدَّد" value={`${fmt(total)} ر.س`} />
      </div>
      <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">
        ℹ️ حساب تقديري بنموذج تقسيط (مرابحة) لأغراض التخطيط فقط — القسط الفعلي ونسبة الربح يحدّدهما البنك أو جهة التمويل حسب أهليتك. المنصّة ليست جهة تمويل.
      </p>
    </div>
  );
}

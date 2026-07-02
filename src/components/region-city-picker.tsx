'use client';
import { useMemo, useState } from 'react';
import { CityCombobox } from '@/components/city-combobox';

type Region = { id: number; name: string };
type Area = { id: number; name: string; cityId: number };

/** المنطقة (13) + المدينة/المحافظة (searchable) — Saudi only. */
export function RegionCityPicker({
  regions, areas, initialRegion, initialArea, regionName = 'city_id', cityName = 'area_id',
  labelClass = 'mb-1 block text-sm font-bold text-foreground',
  fieldClass = 'h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40',
}: {
  regions: Region[]; areas: Area[]; initialRegion?: number | null; initialArea?: number | null;
  regionName?: string; cityName?: string; labelClass?: string; fieldClass?: string;
}) {
  const [region, setRegion] = useState<number>(initialRegion ?? 0);
  const regionCities = useMemo(() => areas.filter((a) => a.cityId === region), [areas, region]);
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>المنطقة</label>
        <select name={regionName} value={region} onChange={(e) => setRegion(Number(e.target.value))} className={fieldClass}>
          <option value={0}>— اختر المنطقة —</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>المدينة <span className="font-normal text-muted-foreground">(المحافظة / المركز)</span></label>
        {region && regionCities.length > 0
          ? <CityCombobox name={cityName} cities={regionCities} defaultId={initialArea ?? undefined} placeholder="ابحث عن المدينة / المحافظة" />
          : <p className="rounded-lg border-2 border-dashed border-primary/25 bg-accent/20 p-2.5 text-xs text-muted-foreground">اختر المنطقة أولاً لعرض المدن والمحافظات.</p>}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { canonicalAreaName } from '@/lib/search-filters';

type Opt = { id: number; name: string; countryId?: number };
type Area = { id: number; name: string; cityId: number };

/** Saudi regions first; cities remain scoped to the selected region. */
export function SearchAreaPicker({ regions, areas, region = '', area = '', className = '' }: {
  regions: Opt[]; areas: Area[]; region?: string; area?: string; className?: string;
}) {
  const saudiRegions = regions.filter((item) => item.countryId === undefined || item.countryId === 1);
  const initialRegion = saudiRegions.some((item) => String(item.id) === region) ? region : '';
  const [regionId, setRegionId] = useState(initialRegion);
  const [areaId, setAreaId] = useState(areas.some((item) => item.cityId === Number(initialRegion) && String(item.id) === area) ? area : '');
  const visible = areas.filter((item) => item.cityId === Number(regionId));
  // Historical imports can contain repeated city names. Preserve an existing selection.
  const unique = new Map<string, Area>();
  for (const item of visible) {
    const key = canonicalAreaName(item.name);
    if (!unique.has(key) || String(item.id) === areaId) unique.set(key, item);
  }
  return <>
    <label className="space-y-1 text-xs font-semibold text-foreground">المنطقة
      <select name="city" value={regionId} onChange={(e) => { setRegionId(e.target.value); setAreaId(''); }} className={className}>
        <option value="">كل مناطق السعودية</option>
        {saudiRegions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="space-y-1 text-xs font-semibold text-foreground">المدينة
      <select name="area" value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!regionId} className={`${className} disabled:opacity-60`}>
        <option value="">{regionId ? 'كل مدن المنطقة' : 'اختر المنطقة أولاً'}</option>
        {[...unique.values()].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  </>;
}

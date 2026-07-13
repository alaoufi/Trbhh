'use client';

import { useState } from 'react';

type Opt = { id: number; name: string };
type Area = Opt & { cityId: number };

/**
 * فلتر ذكي للمنطقة والمدينة في البحث المتقدم: اختيار المنطقة يحدّث قائمة
 * المدن فوراً دون إعادة تحميل، وتغيير المنطقة يصفّر المدينة المختارة.
 */
export function SearchAreaPicker({ regions, areas, region = '', area = '', className = '' }: {
  regions: Opt[];
  areas: Area[];
  region?: string;
  area?: string;
  className?: string;
}) {
  const [regionId, setRegionId] = useState(region);
  const [areaId, setAreaId] = useState(area);
  const visible = regionId ? areas.filter((a) => a.cityId === Number(regionId)) : areas;

  return (
    <>
      <select
        name="city"
        value={regionId}
        onChange={(e) => { setRegionId(e.target.value); setAreaId(''); }}
        className={className}
      >
        <option value="">كل المناطق</option>
        {regions.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
      </select>
      <select name="area" value={areaId} onChange={(e) => setAreaId(e.target.value)} className={className}>
        <option value="">كل المدن</option>
        {visible.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
      </select>
    </>
  );
}

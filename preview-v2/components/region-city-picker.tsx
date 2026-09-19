'use client';
import { SAUDI_AREAS, citiesForRegion } from '../lib/saudi-locations';

export function RegionCityPicker({region, city, onChange, regionError, cityError}: {
 region: string; city: string; onChange: (region: string, city: string) => void;
 regionError?: string; cityError?: string;
}) {
 return <>
  <label className="seller-field" htmlFor="ad-region">المنطقة <span className="seller-required">*</span>
   <select id="ad-region" value={region} onChange={event=>onChange(event.target.value,'')} aria-required="true" aria-invalid={Boolean(regionError)} aria-describedby={regionError?'error-region':undefined}>
    <option value="">اختر المنطقة</option>{Object.keys(SAUDI_AREAS).map(name=><option key={name}>{name}</option>)}
   </select>{regionError&&<span id="error-region" role="alert">{regionError}</span>}
  </label>
  <label className="seller-field" htmlFor="ad-city">المدينة <span className="seller-required">*</span>
   <select id="ad-city" value={city} disabled={!region} onChange={event=>onChange(region,event.target.value)} aria-required="true" aria-invalid={Boolean(cityError)} aria-describedby={cityError?'error-city':undefined}>
    <option value="">{region?'اختر المدينة':'اختر المنطقة أولًا'}</option>{citiesForRegion(region).map(name=><option key={name}>{name}</option>)}
   </select>{cityError&&<span id="error-city" role="alert">{cityError}</span>}
  </label>
 </>;
}

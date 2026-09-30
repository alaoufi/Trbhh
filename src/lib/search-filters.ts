/** URL values are untrusted: reject malformed IDs and prices before querying. */
export function positiveSearchId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function normalizePriceRange(min: unknown, max: unknown) {
  const price = (value: unknown): number | undefined => {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (typeof value === 'string' && !/^\d+(\.\d{1,2})?$/.test(value.trim())) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 2147483647 ? n : undefined;
  };
  let minPrice = price(min);
  let maxPrice = price(max);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  return { minPrice, maxPrice };
}

export function normalizeSearchParams(sp: Record<string, string | undefined>) {
  const range = normalizePriceRange(sp.minPrice, sp.maxPrice);
  return {
    q: sp.q?.trim().slice(0, 200) || undefined,
    categoryId: positiveSearchId(sp.category),
    cityId: positiveSearchId(sp.city),
    areaId: positiveSearchId(sp.area),
    type: sp.type === 'offer' || sp.type === 'request' ? sp.type : undefined,
    sort: sp.sort === 'price_asc' || sp.sort === 'price_desc' ? sp.sort : 'newest',
    special: sp.special === '1',
    ...range,
  } as const;
}

export type CategoryAttributeFilter={
  key:string;
  mode:'equals'|'contains'|'array_contains'|'array_contains_any'|'min'|'max'|'range_min'|'range_max';
  value:string|number|boolean|string[];
};

const safeDecimal=(value:string|undefined)=>{
  if(!value||!(/^-?\d+(?:\.\d{1,2})?$/).test(value.trim()))return undefined;
  const number=Number(value);
  return Number.isFinite(number)&&Math.abs(number)<=Number.MAX_SAFE_INTEGER?number:undefined;
};

/** URL attribute filters are accepted only when the active subcategory definition allows them. */
export function normalizeCategoryAttributeFilters(fields:CategoryField[],sp:Record<string,string|undefined>,listingType?:string,dependencyValues:Record<string,string>={}){
  const filters:CategoryAttributeFilter[]=[],params:Record<string,string>={};
  for(const field of fields.filter(item=>item.filterable&&fieldApplies(item,{listingType,values:dependencyValues}))){
    const name=`attr_${field.key}`;
    if(['number','decimal','year','range'].includes(field.type)){
      for(const [suffix,mode] of [['_min','min'],['_max','max']] as const){
        const raw=sp[`${name}${suffix}`],value=safeDecimal(raw);
        if(value===undefined)continue;
        if(field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max)continue;
        const normalizedMode=field.type==='range'?(mode==='min'?'range_min':'range_max'):mode;
        filters.push({key:field.key,mode:normalizedMode,value});params[`${name}${suffix}`]=String(value);
      }
      continue;
    }
    const raw=sp[name]?.trim();if(!raw)continue;
    if(field.type==='boolean'){
      if(raw!=='1'&&raw!=='0')continue;
      filters.push({key:field.key,mode:'equals',value:raw==='1'});params[name]=raw;continue;
    }
    if(field.type==='multiselect'){
      const selected=[...new Set(raw.split(',').map(value=>value.trim()).filter(value=>field.options.includes(value)))];
      if(!selected.length)continue;
      filters.push({key:field.key,mode:'array_contains_any',value:selected});params[name]=selected.join(',');continue;
    }
    if(field.type==='select'||field.type==='radio'){
      if(!field.options.includes(raw))continue;
      filters.push({key:field.key,mode:'equals',value:raw});params[name]=raw;continue;
    }
    if(raw.length<=120){filters.push({key:field.key,mode:'contains',value:raw});params[name]=raw;}
  }
  return {filters,params};
}

export function canonicalAreaName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
}

/** Legacy imports can assign several IDs to the same city within one Saudi region. */
export function equivalentAreaIds(areas: { id: number; name: string; cityId: number }[], selectedId: number, regionId: number): number[] {
  const selected = areas.find((area) => area.id === selectedId && area.cityId === regionId);
  if (!selected) return [selectedId];
  const canonical = canonicalAreaName(selected.name);
  return [...new Set(areas.filter((area) => area.cityId === regionId && canonicalAreaName(area.name) === canonical).map((area) => area.id))];
}

export function normalizeSaudiAreaSelection(
  regions: {id:number;countryId?:number}[],
  areas: {id:number;cityId:number}[],
  rawRegion: unknown,
  rawArea: unknown,
): {cityId:number|undefined;areaId:number|undefined} {
  const requestedRegion=positiveSearchId(typeof rawRegion==='string'?rawRegion:undefined);
  const cityId=requestedRegion&&regions.some(region=>region.id===requestedRegion&&region.countryId===1)?requestedRegion:undefined;
  const requestedArea=positiveSearchId(typeof rawArea==='string'?rawArea:undefined);
  const areaId=cityId&&requestedArea&&areas.some(area=>area.id===requestedArea&&area.cityId===cityId)?requestedArea:undefined;
  return {cityId,areaId};
}
import {fieldApplies,type CategoryField} from './ad-categories/validation';

import {expect,it} from 'vitest';
import {parseCjCatalogFilters} from '@/lib/cj/catalog-filters';
it('maps selected catalog filters to documented supplier query parameters',()=>{
 const f=parseCjCatalogFilters({minPrice:'2.50',maxPrice:'20',country:'CN',platform:'tiktok',supplier:'SUP-1',minStock:'5',verified:'1',flag:'0',sort:'price_asc'});
 expect(f.error).toBeNull();expect(f.query).toEqual({startSellPrice:2.5,endSellPrice:20,countryCode:'CN',zonePlatform:'tiktok',supplierId:'SUP-1',startWarehouseInventory:5,verifiedWarehouse:1,productFlag:0,orderBy:2,sort:'asc'});
 expect(f.params.get('minPrice')).toBe('2.50');
});
it('rejects invalid or inverted ranges rather than silently searching everything',()=>{
 for(const values of [{minPrice:'20',maxPrice:'2'},{minPrice:'-1'},{minPrice:'NaN'},{minStock:'1.2'},{platform:'aliexpress'},{sort:'injected'},{supplier:'a&b'}])expect(parseCjCatalogFilters(values).error).toBeTruthy();
});
it('preserves only active validated filters and defaults to best match',()=>{
 const f=parseCjCatalogFilters({minPrice:'0',q:'ignored',page:'7'});expect(f.error).toBeNull();expect(f.query).toEqual({startSellPrice:0,orderBy:0,sort:'desc'});expect(f.params.toString()).toBe('minPrice=0');
});

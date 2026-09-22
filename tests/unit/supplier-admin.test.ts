import {describe,it,expect} from 'vitest';
import {parseProductControls,parseIntegrationControls} from '@/lib/suppliers/admin';
const form=(values:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;};
describe('supplier admin inputs',()=>{
 it('keeps independent visibility and enable controls',()=>{const v=parseProductControls(form({id:'1',revision:'0',cost:'40',selling:'47',policy:'manual',visible:'1',minimumPrice:'0',minimumMargin:'0'}));expect(v.costMinor).toBe(4000);expect(v.sellingMinor).toBe(4700);expect(v.visible).toBe(true);expect(v.active).toBe(false);});
 it('rejects unknown providers and modes',()=>{expect(()=>parseIntegrationControls(form({supplierId:'1',provider:'arbitrary',mode:'live'}))).toThrow();expect(()=>parseIntegrationControls(form({supplierId:'1',provider:'salla',mode:'unsafe'}))).toThrow();});
 it('defaults to development and disabled controls',()=>{expect(parseIntegrationControls(form({supplierId:'1',provider:'salla',mode:'development'}))).toMatchObject({mode:'development',syncEnabled:false,autoOrdersEnabled:false});});
 it('allows read-only synchronization but never automatic orders from a development profile',()=>{
  expect(parseIntegrationControls(form({supplierId:'1',provider:'salla',mode:'development',syncEnabled:'1'}))).toMatchObject({syncEnabled:true,autoOrdersEnabled:false});
  expect(()=>parseIntegrationControls(form({supplierId:'1',provider:'salla',mode:'development',autoOrdersEnabled:'1'}))).toThrow('supplier_invalid_fields');
 });
});

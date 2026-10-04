import {describe,it,expect} from 'vitest';
import {CATEGORY_ADMIN_PAGES} from '@/lib/ad-categories/admin-navigation';
import {HELP_STEPS,parseHelpSettings} from '@/lib/category-help';

describe('category help content',()=>{
 it('covers existing pages without inventing category routes',()=>{
  for(const key of Object.keys(CATEGORY_ADMIN_PAGES)) expect(HELP_STEPS.some(s=>s.href===`/admin/categories/${key}`)).toBe(true);
 });
 it('defaults to enabled and preserves safe fixed destinations',()=>{
  expect(parseHelpSettings('bad json').enabled).toBe(true);
  expect(parseHelpSettings('{}').captions).toHaveLength(HELP_STEPS.length);
 });
 it('accepts editable captions but rejects incomplete and oversized values',()=>{
  const captions=HELP_STEPS.map(s=>s.caption);
  expect(parseHelpSettings(JSON.stringify({enabled:false,captions}),true).enabled).toBe(false);
  expect(()=>parseHelpSettings(JSON.stringify({enabled:true,captions:[]}),true)).toThrow();
  expect(()=>parseHelpSettings(JSON.stringify({enabled:true,captions:captions.map(()=> 'x'.repeat(1201))}),true)).toThrow();
 });
});

import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({changed:false,unknown:false,leftover:false,engine:'InnoDB',writes:[] as string[],interests:[{user_id:7n,category_id:13n},{user_id:7n,category_id:32n}],options:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:async(work:(tx:unknown)=>unknown,options:unknown)=>{f.options(options);return work({$queryRaw:async()=>[{id:13n,name:'عروض اخرى',is_active:'yes'},{id:32n,name:'عروض أخرى',is_active:'yes'}],$queryRawUnsafe:async(q:string)=>{
 if(q.includes('LIMIT 1 FOR UPDATE')&&f.writes.some(w=>w.startsWith('UPDATE')))return f.leftover?[{ref:13n}]:[];
 if(q.includes('information_schema.COLUMNS'))return [...['sub_categories','cj_products','stores','category__users'].map(t=>({t,c:'category_id',e:f.engine})),{t:'ads',c:'category_id',e:f.engine},{t:'member_interests',c:'category_id',e:f.engine},...(f.unknown?[{t:'unknown_references',c:'category_id',e:f.engine}]:[])];
 if(q.includes('unknown_references'))return [{ref:13n}];if(q.includes('member_interests'))return f.interests;
 if(q.includes('FROM `ads`'))return [{id:1n,category_id:13n},...(f.changed?[{id:2n,category_id:13n}]:[])];return [];
 },$executeRaw:async(strings:TemplateStringsArray)=>{f.writes.push(strings.join('?'));return 1;},$executeRawUnsafe:async(q:string)=>{f.writes.push(q);return 1;}});}}}));
import {previewCategoryMerge,mergeCategories} from '@/lib/ad-categories/merge';
beforeEach(()=>{f.changed=false;f.unknown=false;f.leftover=false;f.engine='InnoDB';f.writes=[];f.options.mockClear();});
it('previews without writes and requires a distinct source and target',async()=>{const p=await previewCategoryMerge(13,32);expect(p.source.name).toBe('عروض اخرى');expect(p.target.name).toBe('عروض أخرى');expect(p.counts.ads).toEqual({source:1,target:0});expect(f.writes).toEqual([]);await expect(previewCategoryMerge(13,13)).rejects.toThrow();});
it('refuses stale or forged previews before any mutation',async()=>{const p=await previewCategoryMerge(13,32);f.changed=true;await expect(mergeCategories(1,13,32,p.token)).rejects.toThrow('تغيّرت');expect(f.writes).toEqual([]);});
it('moves category references, resolves only duplicate interest memberships and never deletes ads',async()=>{const p=await previewCategoryMerge(13,32);await mergeCategories(1,13,32,p.token);const sql=f.writes.join('\n');expect(sql).toContain('UPDATE `ads`');expect(sql).toContain('DELETE s FROM member_interests');expect(sql).toContain('DELETE FROM categories');expect(sql).toContain('ad_category_audit');expect(sql).not.toMatch(/DELETE FROM [`]?ads|DELETE FROM sub_categories|DELETE FROM cj_products|SET .*price|SET .*status/);expect(f.options).toHaveBeenCalledWith({isolationLevel:'Serializable',timeout:30000});});
it('fails closed for unknown populated references',async()=>{f.unknown=true;await expect(previewCategoryMerge(13,32)).rejects.toThrow('ارتباط');expect(f.writes).toEqual([]);});

it('rejects nontransactional references and missing targets before mutations',async()=>{f.engine='MyISAM';await expect(previewCategoryMerge(13,32)).rejects.toThrow('الآمن');expect(f.writes).toEqual([]);f.engine='InnoDB';await expect(previewCategoryMerge(13,31)).rejects.toThrow('غير موجود');});
it('does not delete the source if any references remain after the move',async()=>{const p=await previewCategoryMerge(13,32);f.leftover=true;await expect(mergeCategories(1,13,32,p.token)).rejects.toThrow('بقيت');expect(f.writes.some(q=>q.startsWith('DELETE FROM categories'))).toBe(false);});
it('rejects a forged token even when the source counts are unchanged',async()=>{await expect(mergeCategories(1,13,32,'0'.repeat(64))).rejects.toThrow('تغيّرت');expect(f.writes).toEqual([]);});


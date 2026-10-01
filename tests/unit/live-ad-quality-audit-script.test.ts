import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const require=createRequire(import.meta.url);
const audit=require('../../scripts/release/audit-live-ad-quality.cjs');

describe('live read-only ad quality report',()=>{
  const base={subcategory_id:2,subcategory_exists:1,subcategory_active:1,subcategory_matches:1,subcategory_parent_id:1,category_id:1,category_exists:1,duplicate_category_count:1};
  it('returns one factual primary reason for each invalid leaf relation',()=>{
    expect(audit.classifySubcategoryReason({...base,subcategory_id:null})).toBe('subcategory_missing');
    expect(audit.classifySubcategoryReason({...base,subcategory_exists:0})).toBe('subcategory_not_found');
    expect(audit.classifySubcategoryReason({...base,subcategory_active:0})).toBe('legacy_id');
    expect(audit.classifySubcategoryReason({...base,subcategory_matches:0,duplicate_category_count:2})).toBe('duplicate_category');
    expect(audit.classifySubcategoryReason({...base,subcategory_matches:0,category_remap_target_id:9})).toBe('category_remapped');
    expect(audit.classifySubcategoryReason({...base,subcategory_matches:0})).toBe('parent_child_mismatch');
    expect(audit.classifySubcategoryReason({...base,subcategory_exists:0n})).toBe('subcategory_not_found');
  });

  it('treats bigint zero database flags as false while auditing',()=>{
    const issues=audit.auditRow({...base,category_exists:0n,location_matches:0n,city_id:1,area_id:1,price:10,old_price:0});
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'invalid_category'}),
      expect.objectContaining({code:'missing_or_mismatched_location',reason:'location_mismatch'}),
    ]));
  });

  it('counts location reasons and uncertain category relations independently',()=>{
    const report=audit.summarize([
      {...base,id:1,city_id:null,area_id:null,price:0,old_price:0},
      {...base,id:2,subcategory_matches:0,city_id:1,area_id:1,location_matches:0,price:0,old_price:0},
    ],[]).summary;
    expect(report.locationReasons).toEqual({missing_location:1,location_mismatch:1});
    expect(report.needsEditorReview).toBe(1);
    expect(report.impacts).toMatchObject({BLOCKING_PUBLIC:0,NEEDS_EDITOR_REVIEW:1,SAFE_LEGACY:1});
  });

  it('keeps unresolved taxonomy for editors after public labels, fields and filters are suppressed',()=>{
    const issues=audit.auditRow({...base,id:9,subcategory_matches:0,city_id:1,area_id:1,location_matches:1,price:0,old_price:0});
    expect(issues.find((issue:{code:string})=>issue.code==='invalid_subcategory')).toMatchObject({
      impact:'NEEDS_EDITOR_REVIEW',reviewDisposition:'NEEDS_EDITOR_REVIEW',publicTaxonomySuppressed:true,
    });
  });

  it('separates active-but-hidden search cards by exact exclusion reason',()=>{
    const now=new Date('2026-10-01T00:00:00Z');
    const rows=[
      {id:1n,user_id:1n,created_at:new Date('2026-09-30'),adsSpecial:'no',expires_at:null,urgent_until:null,ban:''},
      {id:2n,user_id:2n,created_at:new Date('2026-09-30'),adsSpecial:'no',expires_at:null,urgent_until:null,ban:'checked'},
      {id:3n,user_id:3n,created_at:new Date('2026-08-01'),adsSpecial:'no',expires_at:null,urgent_until:null,ban:''},
      {id:4n,user_id:3n,created_at:new Date('2026-08-01'),adsSpecial:'checked',expires_at:new Date('2026-10-02'),urgent_until:null,ban:''},
    ];
    expect(audit.searchVisibilityBreakdown(rows,{plans:[{id:1,ad_days:30,is_default:1,price:0}],subscriptions:[],now})).toEqual({activeBase:4,searchVisible:2,excluded:{banned_seller:1,package_age:1}});
    expect(audit.buildCountAlignment(rows,{plans:[{id:1,ad_days:30,is_default:1,price:0}],subscriptions:[],now})).toEqual({
      previewRuntime:{activeBase:4,searchVisible:3,excluded:{banned_seller:1,package_age:0}},
      configuredPackagePolicySimulation:{activeBase:4,searchVisible:2,excluded:{banned_seller:1,package_age:1}},
    });
  });

  it('reports a source and review state for every live leaf without an unknown generic fallback',()=>{
    const manifest={templates:[{key:'lifting',categoryName:'نقليات ومعدات ثقيلة',name:'رافعات ومناولة',fields:[{required:true},{required:false,dependsOn:'equipment_kind'}]}],qualityReviews:[{key:'lifting',status:'PASS',reason:'مراجع'}]};
    const rows=[{subcategory_id:5,subcategory_name:'رافعات ومناولة',category_name:'نقليات ومعدات ثقيلة',fields_json:null}];
    const report=audit.buildSchemaReport(rows,manifest);
    expect(report.rows[0]).toMatchObject({leafKey:'lifting',source:'code_template',fieldCount:2,requiredCount:1,conditionalCount:1,qualityStatus:'PASS'});
    expect(report.sourceCounts).toEqual({DB:0,code_template:1,inherited:0,fallback:0});
  });

  it('publishes a separate summary restricted to public active advertisements',()=>{
    const source=readFileSync('scripts/release/audit-live-ad-quality.cjs','utf8');
    expect(source).toContain('report.publicSummary=summarize(activeBase,duplicates).summary');
  });

  it('recognises both raw MySQL and Prisma names for the active ad state',()=>{
    expect(audit.isActiveRow({status:1,state:'1'})).toBe(true);
    expect(audit.isActiveRow({status:1,state:'active'})).toBe(true);
    expect(audit.isActiveRow({status:1,state:'0'})).toBe(false);
    expect(audit.isActiveRow({status:0,state:'1'})).toBe(false);
  });
});

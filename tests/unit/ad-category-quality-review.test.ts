import {describe,expect,it} from 'vitest';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {templateQualityReview} from '@/lib/ad-categories/quality-review';

describe('professional leaf schema review registry',()=>{
  it('assigns every leaf a known reviewed status and reason',()=>{
    expect(CATEGORY_SEED_TEMPLATES).toHaveLength(85);
    const reviews=CATEGORY_SEED_TEMPLATES.map(template=>({template,...templateQualityReview(template)}));
    expect(reviews.every(review=>review.reason.trim().length>=12)).toBe(true);
    expect(reviews.every(review=>['PASS','NEEDS_FIELD_CHANGE','NEEDS_REQUIRED_CHANGE','NEEDS_OPTIONAL_CHANGE','NEEDS_CONDITIONAL_CHANGE','NEEDS_INPUT_TYPE_CHANGE'].includes(review.status))).toBe(true);
    expect(new Set(reviews.map(review=>review.template.key)).size).toBe(85);
  });

  it('records the reviewed decisions for the confirmed service and lifting cases',()=>{
    expect(templateQualityReview(CATEGORY_SEED_TEMPLATES.find(template=>template.key==='lifting')!)).toMatchObject({status:'PASS'});
    expect(templateQualityReview(CATEGORY_SEED_TEMPLATES.find(template=>template.key==='contracting')!)).toMatchObject({status:'PASS'});
    expect(templateQualityReview(CATEGORY_SEED_TEMPLATES.find(template=>template.key==='legacy_heavy_equipment')!)).toMatchObject({status:'NEEDS_CONDITIONAL_CHANGE'});
    expect(templateQualityReview(CATEGORY_SEED_TEMPLATES.find(template=>template.key==='legacy_equipment_rental')!)).toMatchObject({status:'NEEDS_CONDITIONAL_CHANGE'});
  });
});

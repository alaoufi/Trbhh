import { describe, it, expect } from 'vitest';
import { ROLE_PRESET, ALL_KEYS, ALL_MATRIX_KEYS, MATRIX_LOCKED, SERVICES, MATRIX_ROLES } from '@/lib/roles';

// قاعدة العمل ٩: «مراقب متاجر تربّح» معزول تماماً في إدارة المتاجر.
describe('عزل دور مراقب المتاجر', () => {
  it('كل صلاحياته تبدأ بـ stores: حصراً', () => {
    const keys = ROLE_PRESET.store_monitor;
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.startsWith('stores:')).toBe(true);
  });

  it('يملك كامل نطاق المتاجر: عرض/تعديل/إيقاف/حذف', () => {
    const keys = new Set(ROLE_PRESET.store_monitor);
    for (const a of ['view', 'edit', 'suspend', 'delete']) expect(keys.has(`stores:${a}`)).toBe(true);
  });

  it('الدور معرّف ضمن مصفوفة الأدوار', () => {
    expect(MATRIX_ROLES).toContain('store_monitor');
  });
});

// خصوصية الأعضاء: لا يجوز لأي موظف تعديل محتوى إعلان عضو.
describe('قفل تعديل الإعلانات (خصوصية)', () => {
  it('خدمة الإعلانات لا تتضمن إجراء edit إطلاقاً', () => {
    const ads = SERVICES.find((s) => s.key === 'ads');
    expect(ads).toBeDefined();
    expect(ads!.actions).not.toContain('edit');
    expect(ALL_KEYS).not.toContain('ads:edit');
  });

  it('المصفوفة تقفل ads:edit صراحةً', () => {
    expect(MATRIX_LOCKED.has('ads:edit')).toBe(true);
    expect(ALL_MATRIX_KEYS).not.toContain('ads:edit');
  });
});

describe('سلامة تعريف الأدوار', () => {
  it('المدير العام يملك كل المفاتيح', () => {
    expect(ROLE_PRESET.manager).toEqual(ALL_KEYS);
  });
  it('خدمة المتاجر موجودة ضمن الخدمات', () => {
    expect(SERVICES.some((s) => s.key === 'stores')).toBe(true);
  });
  it('كل مفاتيح الأدوار الجاهزة مفاتيح صالحة معروفة', () => {
    const valid = new Set(ALL_KEYS);
    for (const role of ['moderator', 'monitor', 'store_monitor'] as const) {
      for (const k of ROLE_PRESET[role]) expect(valid.has(k)).toBe(true);
    }
  });
});

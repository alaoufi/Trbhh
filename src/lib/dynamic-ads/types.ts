import type { DynamicField } from './schema';

export type DynamicFieldGroup = { id: number; key: string; label: string; inputOrder: number; displayOrder: number };

export type DynamicEntity = { id: number; key: string; name: string; icon: string; active: boolean; order: number; groups: DynamicFieldGroup[]; fields: DynamicField[] };
export type DynamicAnalysis = {
  entityKey: string | null;
  confidence: number;
  extracted: Record<string, string | number | boolean>;
  missing: string[];
  suggestions: string[];
  quality: number;
};
export type DynamicAdDraft = { id: number; entityId: number | null; title: string; description: string; price: number | null; locationText: string | null; values: Record<string, unknown>; analysis: DynamicAnalysis; status: 'draft' | 'analysed' | 'ready' };

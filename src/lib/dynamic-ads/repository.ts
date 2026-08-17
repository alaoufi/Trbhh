import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import type { DynamicField } from './schema';
import type { DynamicAdDraft, DynamicAnalysis, DynamicEntity } from './types';

type EntityRow = { id: bigint; entity_key: string; name_ar: string; icon: string; is_active: number; display_order: number };
type FieldRow = { id: bigint; entity_id: bigint; field_key: string; label_ar: string; field_type: DynamicField['type']; required_flag: number; searchable_flag: number; options_json: unknown; display_order: number };
type DraftRow = { id: bigint; entity_id: bigint | null; title: string; description: string; price: unknown; location_text: string | null; status: 'draft' | 'analysed' | 'ready'; extracted_json: unknown; missing_json: unknown; suggestions_json: unknown; values_json: unknown; detected_entity_key: string | null; confidence: unknown; quality_score: number };

let schemaReady: Promise<void> | null = null;
function scalar(value: unknown) { return typeof value === 'bigint' ? Number(value) : Number(value); }
function json<T>(value: unknown, fallback: T): T { try { return typeof value === 'string' ? JSON.parse(value) as T : (value as T) ?? fallback; } catch { return fallback; } }

/** Executes only idempotent pilot DDL, once per application process. */
export function ensureDynamicAdsSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const source = await readFile(path.join(process.cwd(), 'database/2026-08-17-dynamic-ads.sql'), 'utf8');
    for (const statement of source.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/--[^\n]*/g, '').trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

function field(row: FieldRow): DynamicField {
  return { key: row.field_key, label: row.label_ar, type: row.field_type, required: !!row.required_flag, searchable: !!row.searchable_flag, options: json<string[]>(row.options_json, []) };
}

export async function listDynamicEntities(includeInactive = false): Promise<DynamicEntity[]> {
  await ensureDynamicAdsSchema();
  const entities = await prisma.$queryRawUnsafe<EntityRow[]>(`SELECT id, entity_key, name_ar, icon, is_active, display_order FROM dynamic_entities ${includeInactive ? '' : 'WHERE is_active=1'} ORDER BY display_order, id`);
  const fields = await prisma.$queryRawUnsafe<FieldRow[]>('SELECT id, entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order FROM dynamic_entity_fields WHERE is_active=1 ORDER BY display_order, id');
  return entities.map((row) => ({ id: scalar(row.id), key: row.entity_key, name: row.name_ar, icon: row.icon, active: !!row.is_active, order: row.display_order, fields: fields.filter((f) => scalar(f.entity_id) === scalar(row.id)).map(field) }));
}

export async function dynamicEntityByKey(key: string): Promise<DynamicEntity | null> {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) return null;
  return (await listDynamicEntities(true)).find((entity) => entity.key === key) ?? null;
}

export async function saveDynamicDraft(input: { userId: number; entityId: number | null; title: string; description: string; price: number | null; locationText: string | null; values: Record<string, unknown>; fingerprint: string; analysis: DynamicAnalysis }): Promise<number> {
  await ensureDynamicAdsSchema();
  const result = await prisma.$executeRawUnsafe(
    'INSERT INTO dynamic_advertisements (user_id, entity_id, title, description, price, location_text, status, detected_entity_key, confidence, quality_score, extracted_json, missing_json, suggestions_json, values_json, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    input.userId, input.entityId, input.title.slice(0, 255), input.description.slice(0, 10_000), input.price, input.locationText?.slice(0, 255) || null,
    'analysed', input.analysis.entityKey, input.analysis.confidence, input.analysis.quality, JSON.stringify(input.analysis.extracted), JSON.stringify(input.analysis.missing), JSON.stringify(input.analysis.suggestions), JSON.stringify(input.values), input.fingerprint,
  ) as unknown as { insertId: bigint | number };
  return scalar(result.insertId);
}

export async function dynamicDraftById(id: number, userId: number): Promise<DynamicAdDraft | null> {
  await ensureDynamicAdsSchema();
  const rows = await prisma.$queryRawUnsafe<DraftRow[]>('SELECT id, entity_id, title, description, price, location_text, status, detected_entity_key, confidence, quality_score, extracted_json, missing_json, suggestions_json, values_json FROM dynamic_advertisements WHERE id=? AND user_id=? LIMIT 1', id, userId);
  const row = rows[0];
  if (!row) return null;
  const analysis: DynamicAnalysis = { entityKey: row.detected_entity_key, confidence: scalar(row.confidence), quality: row.quality_score, extracted: json(row.extracted_json, {}), missing: json(row.missing_json, []), suggestions: json(row.suggestions_json, []) };
  return { id: scalar(row.id), entityId: row.entity_id === null ? null : scalar(row.entity_id), title: row.title, description: row.description, price: row.price === null ? null : scalar(row.price), locationText: row.location_text, values: json(row.values_json, {}), status: row.status, analysis };
}

export async function searchDynamicDrafts(input: { userId: number; entityId?: number; term?: string; limit?: number }): Promise<DynamicAdDraft[]> {
  await ensureDynamicAdsSchema();
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const filters = ['user_id=?']; const params: (string | number)[] = [input.userId];
  if (input.entityId) { filters.push('entity_id=?'); params.push(input.entityId); }
  if (input.term?.trim()) { filters.push('(title LIKE ? OR description LIKE ?)'); params.push(`%${input.term.trim().slice(0, 80)}%`, `%${input.term.trim().slice(0, 80)}%`); }
  const rows = await prisma.$queryRawUnsafe<DraftRow[]>(`SELECT id, entity_id, title, description, price, location_text, status, detected_entity_key, confidence, quality_score, extracted_json, missing_json, suggestions_json, values_json FROM dynamic_advertisements WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC LIMIT ${limit}`, ...params);
  return rows.map((row) => ({ id: scalar(row.id), entityId: row.entity_id === null ? null : scalar(row.entity_id), title: row.title, description: row.description, price: row.price === null ? null : scalar(row.price), locationText: row.location_text, values: json(row.values_json, {}), status: row.status, analysis: { entityKey: row.detected_entity_key, confidence: scalar(row.confidence), quality: row.quality_score, extracted: json(row.extracted_json, {}), missing: json(row.missing_json, []), suggestions: json(row.suggestions_json, []) } }));
}

export async function listDynamicAdminDrafts(limit = 40): Promise<DynamicAdDraft[]> {
  await ensureDynamicAdsSchema();
  const rows = await prisma.$queryRawUnsafe<DraftRow[]>(`SELECT id, entity_id, title, description, price, location_text, status, detected_entity_key, confidence, quality_score, extracted_json, missing_json, suggestions_json, values_json FROM dynamic_advertisements ORDER BY updated_at DESC LIMIT ${Math.max(1, Math.min(100, limit))}`);
  return rows.map((row) => ({ id: scalar(row.id), entityId: row.entity_id === null ? null : scalar(row.entity_id), title: row.title, description: row.description, price: row.price === null ? null : scalar(row.price), locationText: row.location_text, values: json(row.values_json, {}), status: row.status, analysis: { entityKey: row.detected_entity_key, confidence: scalar(row.confidence), quality: row.quality_score, extracted: json(row.extracted_json, {}), missing: json(row.missing_json, []), suggestions: json(row.suggestions_json, []) } }));
}

export async function createDynamicEntity(input: { key: string; name: string; icon: string }) {
  await ensureDynamicAdsSchema();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(input.key)) throw new Error('invalid_entity_key');
  await prisma.$executeRawUnsafe('INSERT INTO dynamic_entities (entity_key, name_ar, icon, display_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 10 FROM (SELECT display_order FROM dynamic_entities) AS ordered_entities)) ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar), icon=VALUES(icon), is_active=1', input.key, input.name.slice(0, 120), input.icon.slice(0, 16) || '📦');
}

export async function createDynamicField(input: { entityId: number; key: string; label: string; type: DynamicField['type']; required: boolean; searchable: boolean; options: string[] }) {
  await ensureDynamicAdsSchema();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(input.key)) throw new Error('invalid_field_key');
  await prisma.$executeRawUnsafe('INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 10 FROM (SELECT display_order FROM dynamic_entity_fields WHERE entity_id=?) AS ordered_fields)) ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type), required_flag=VALUES(required_flag), searchable_flag=VALUES(searchable_flag), options_json=VALUES(options_json), is_active=1', input.entityId, input.key, input.label.slice(0, 120), input.type, input.required ? 1 : 0, input.searchable ? 1 : 0, JSON.stringify(input.options.slice(0, 30).map((option) => option.slice(0, 80))), input.entityId);
}

export async function setDynamicEntityActive(id: number, active: boolean) {
  await ensureDynamicAdsSchema();
  await prisma.$executeRawUnsafe('UPDATE dynamic_entities SET is_active=? WHERE id=?', active ? 1 : 0, id);
}

/** Explicit corrections are the only training signal retained by the pilot. */
export async function confirmDynamicDraftEntity(input: { draftId: number; userId: number; entityId: number }) {
  await ensureDynamicAdsSchema();
  const entities = await prisma.$queryRawUnsafe<{ entity_key: string }[]>('SELECT entity_key FROM dynamic_entities WHERE id=? AND is_active=1 LIMIT 1', input.entityId);
  if (!entities[0]) throw new Error('entity_not_found');
  const changed = await prisma.$executeRawUnsafe('UPDATE dynamic_advertisements SET entity_id=? WHERE id=? AND user_id=?', input.entityId, input.draftId, input.userId) as unknown as { affectedRows: number };
  if (!changed.affectedRows) throw new Error('draft_not_found');
  await prisma.$executeRawUnsafe('INSERT INTO dynamic_analysis_feedback (advertisement_id, user_id, selected_entity_id, detected_entity_key, feedback_type, payload_json) VALUES (?, ?, ?, ?, ?, ?)', input.draftId, input.userId, input.entityId, entities[0].entity_key, 'entity_confirmed', JSON.stringify({ source: 'lab' }));
}

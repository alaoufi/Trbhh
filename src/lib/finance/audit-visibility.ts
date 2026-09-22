import 'server-only';
import { FINANCE_SECTION_MODULE } from '@/lib/access-control/catalog';
import type { FinanceAudit, FinanceData } from './types';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** These requirements describe the sources actually stored inside each audit payload. */
function sourceModules(row: FinanceAudit, data: FinanceData): readonly string[] | null {
  switch (row.entity) {
    case 'invoice': return ['invoices'];
    case 'settlement': case 'accrual': return ['settlements'];
    case 'budget': return ['budget'];
    case 'expense': return ['expenses'];
    case 'refund': case 'return': return ['returns'];
    case 'tax': case 'tax_policy': return ['tax'];
    case 'period': return ['periods', 'finance'];
    // A review stores full monetary sources, including customer invoice snapshots.
    case 'reconciliation': return ['reconciliation', 'finance', 'settlements', 'invoices', 'expenses', 'returns'];
    case 'change': {
      // Resolve from the saved request, never inferred from a submitted kind or JSON shape.
      const request = data.requests?.find(item => item.id === row.entityId);
      switch (request?.kind) {
        case 'return': return ['returns'];
        case 'tax_settings': return ['tax'];
        case 'reopen_period': return ['periods', 'finance'];
        default: return null;
      }
    }
    case 'report': {
      const section = object(row.payload).section;
      if (typeof section !== 'string') return null;
      if (/^invoice:[1-9]\d*$/.test(section)) return ['invoices'];
      return Object.hasOwn(FINANCE_SECTION_MODULE, section) ? [FINANCE_SECTION_MODULE[section]] : null;
    }
    default: return null;
  }
}

/** Apply before filtering, rendering, or exporting. Unknown sources fail closed. */
export function redactFinanceAudit(data: FinanceData, keys: ReadonlySet<string>): FinanceData {
  const audit = keys.has('audit:view') ? (data.audit ?? []).map(row => {
    const modules = sourceModules(row, data);
    if (modules?.every(accessModule => keys.has(`${accessModule}:view`))) return row;
    // Whitelist metadata so future payload fields cannot accidentally bypass redaction.
    return {
      id: row.id, at: row.at, actorId: row.actorId, action: row.action,
      entity: row.entity, entityId: row.entityId, reason: '',
      ip: row.ip, sessionFingerprint: row.sessionFingerprint,
    };
  }) : [];
  return { ...data, audit };
}

import { describe, expect, it } from 'vitest';
import { providerMeta } from '@/lib/payments/registry';

describe('Neoleap credential labels', () => {
  it('uses the provider field names without ambiguous replacements', () => {
    const fields = providerMeta('neoleap')?.creds ?? [];
    expect(fields.map((field) => field.key)).toEqual([
      'terminal_id', 'terminal_name', 'merchant_id', 'terminal_alias_name',
      'tranportal_id', 'tranportal_password', 'terminal_resource_key',
    ]);
    expect(fields.map((field) => field.label)).toEqual([
      'Terminal ID', 'Terminal Name', 'Merchant ID', 'Terminal Alias Name',
      'Tranportal ID', 'Tranportal Password', 'Terminal Resource Key',
    ]);
  });
});

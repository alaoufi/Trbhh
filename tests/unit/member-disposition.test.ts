import { describe, expect, it } from 'vitest';
import { dispositionFor } from '@/lib/member-disposition';

const empty = { advertisements: 0, stores: 0, balanceHalala: 0, walletTransactions: 0, topups: 0, messages: 0 };
describe('member archive policy', () => {
  it('archives every account that still has rights or history', () => {
    expect(dispositionFor({ ...empty, advertisements: 1 })).toBe('archive');
    expect(dispositionFor({ ...empty, stores: 1 })).toBe('archive');
    expect(dispositionFor({ ...empty, balanceHalala: 1 })).toBe('archive');
    expect(dispositionFor({ ...empty, topups: 1 })).toBe('archive');
    expect(dispositionFor({ ...empty, messages: 1 })).toBe('archive');
  });
  it('only permits permanent deletion when no dependency remains', () => {
    expect(dispositionFor(empty)).toBe('delete');
  });
});

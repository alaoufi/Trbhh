export type PlatformAdState = 'not-enforced' | 'active' | 'renewal-required' | 'payment-archived' | 'store-front-only';

export type PlatformAdStateInput = {
  enabled: boolean;
  storeOnly: boolean;
  until: Date | null;
  now: Date;
  archiveAfterDays?: number;
};

export function platformAdState(input: PlatformAdStateInput): PlatformAdState {
  if (!input.enabled) return 'not-enforced';
  if (input.storeOnly && !input.until) return 'store-front-only';
  if (input.until && input.until > input.now) return 'active';
  const archiveAfterDays = Math.max(0, input.archiveAfterDays ?? 0);
  if (input.until && archiveAfterDays > 0 && input.until.getTime() + archiveAfterDays * 86_400_000 <= input.now.getTime()) return 'payment-archived';
  return 'renewal-required';
}

export function renewalDecision(input: { balance: number; packagePrice: number }): { allowed: boolean; shortfall: number } {
  const balanceHalalas = Math.round(Math.max(0, input.balance) * 100);
  const priceHalalas = Math.round(Math.max(0, input.packagePrice) * 100);
  return { allowed: balanceHalalas >= priceHalalas, shortfall: Math.max(0, priceHalalas - balanceHalalas) / 100 };
}

export function formatSar(amount: number): string {
  return (Math.round(Math.max(0, amount) * 100) / 100).toFixed(2);
}

export function newPlatformAdDecision(input: { enabled: boolean; storeOnly: boolean; freeUsedToday: number; freeDailyLimit: number; freeDays: number }): { grantFreeDays: number; needsPayment: boolean } {
  if (!input.enabled) return { grantFreeDays: 0, needsPayment: false };
  const eligibleForFreePlacement = !input.storeOnly
    && input.freeDailyLimit > 0
    && input.freeDays > 0
    && input.freeUsedToday < input.freeDailyLimit;
  return eligibleForFreePlacement
    ? { grantFreeDays: Math.floor(input.freeDays), needsPayment: false }
    : { grantFreeDays: 0, needsPayment: true };
}

export const WALLET_TOPUP_QUICK_AMOUNTS = [10, 50, 100, 500, 1000] as const;

export function walletTopupView(methods: { electronic: boolean; transfer: boolean }) {
  return {
    showElectronic: methods.electronic,
    showBankTransfer: methods.transfer,
    quickAmounts: [...WALLET_TOPUP_QUICK_AMOUNTS],
  };
}

/** Read-only visual fixture: no database, permissions, network, or mutation implementations. */
const unavailable = async () => { throw new Error('FIXTURE_ONLY: financial actions are disabled'); };
export const saveFinanceBudget = unavailable;
export const recordFinanceExpense = unavailable;
export const reverseFinanceExpense = unavailable;
export const releaseFinanceAccrual = unavailable;
export const prepareFinanceSettlement = unavailable;
export const approveFinanceSettlement = unavailable;
export const reverseFinanceSettlement = unavailable;
export const closeFinanceMonth = unavailable;
export const captureFinanceInvoices = unavailable;

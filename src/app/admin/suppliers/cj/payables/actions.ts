'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireAccess} from '@/lib/access-control/guards';
import {setSetting} from '@/lib/settings';
import {prepareCjSettlementBatch,reconcileCjSettlementBatch,getCjSettlementBatch,authorizeCjSettlementWalletBatch} from '@/lib/cj/settlements';
import {reconcileCjFulfillmentPayment,prepareCjFulfillmentCardPayment} from '@/lib/cj/fulfillment';
import {settlementSelection,settlementWaitHours,settlementExpectedAmount} from './policy';
import {prepareUnifiedCjSettlement} from '@/lib/cj/settlements/unified-card';

const path = '/admin/suppliers/cj/payables';
async function authorise() {
  await requireAccess('settlements','edit');
  const session = await requireAccess('orders','view');
  await requireAccess('orders','edit');
  await requireAccess('wallets','view');
  return session;
}
/** Explicit unpaid preparation; never consumes a wallet authorization. */
export async function prepareUnpaidSupplierOrder(form: FormData) {
  await authorise();
  if(form.get('confirmUnpaid')!=='1')redirect(`${path}?error=confirmation`);
  let id:string;
  try { [id]=settlementSelection([form.get('fulfillmentId') as FormDataEntryValue]); }
  catch { redirect(`${path}?error=selection`); }
  try { await prepareCjFulfillmentCardPayment(id); }
  catch { redirect(`${path}?error=prepare`); }
  revalidatePath(path);
  redirect(`${path}?prepared=1`);
}
/** Reserves a durable batch, then prepares card links only; never debits funds. */
export async function prepareSettlement(form: FormData) {
  const session = await authorise();
  let ids: string[];
  try { ids = settlementSelection(form.getAll('fulfillmentId')); }
  catch { redirect(`${path}?error=selection`); }
  if (form.get('reviewed') !== '1') redirect(`${path}?error=confirmation`);
  const rawKey = form.get('requestKey');
  if (typeof rawKey !== 'string' || !/^[0-9a-f-]{36}$/.test(rawKey)) redirect(`${path}?error=selection`);
  let batch: Awaited<ReturnType<typeof prepareCjSettlementBatch>>;
  try { batch = await prepareCjSettlementBatch(ids,BigInt(session.uid),rawKey); }
  catch { redirect(`${path}?error=changed`); }
  let incomplete=false;
  try{
    const saved=await getCjSettlementBatch(batch.id);
    if(!saved)throw Error('missing');
    await prepareUnifiedCjSettlement(batch.id);
  }catch{incomplete=true;}
  revalidatePath(path);
  redirect(`${path}?batch=${encodeURIComponent(batch.id)}${incomplete?'&error=prepare':''}#cj-batch-payment`);
}
/** Supplier proof reconciliation only; explicitly no balance payment. */
export async function refreshSettlement(form: FormData) {
  await authorise();
  const id = form.get('batchId');
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) redirect(`${path}?error=selection`);
  let incomplete = false;
  try {
    const batch = await getCjSettlementBatch(id);
    if (!batch) throw Error('missing');
    for (const line of batch.lines) {
      if (line.status !== 'paid') {
        try { await reconcileCjFulfillmentPayment(line.id); }
        catch { incomplete = true; }
      }
    }
    await reconcileCjSettlementBatch(id);
  }
  catch { redirect(`${path}?error=refresh`); }
  revalidatePath(path);
  if (incomplete) redirect(`${path}?batch=${encodeURIComponent(id)}&error=refresh`);
  redirect(`${path}?batch=${encodeURIComponent(id)}&refreshed=1`);
}
/** Explicit staff authorization queues per-order wallet payments; render never grants it. */
export async function authorizeWalletSettlement(form: FormData) {
  await requireAccess('settlements','approve');
  const session = await authorise();
  await requireAccess('wallets','edit');
  if (form.get('confirmWalletDebit') !== '1') redirect(`${path}?error=wallet_confirmation`);
  let id: string; let amount: number;
  try { [id] = settlementSelection([form.get('batchId') as FormDataEntryValue]); amount = settlementExpectedAmount(form.get('expectedTotalUsdMinor')); }
  catch { redirect(`${path}?error=selection`); }
  try { await authorizeCjSettlementWalletBatch(id,BigInt(session.uid),amount); }
  catch { redirect(`${path}?batch=${encodeURIComponent(id)}&error=wallet_changed`); }
  revalidatePath(path);
  redirect(`${path}?batch=${encodeURIComponent(id)}&authorized=1`);
}
export async function saveSettlementWait(form: FormData) {
  await authorise();
  await requireAccess('integrations','manage_settings');
  let hours: number;
  try { hours = settlementWaitHours(form.get('hours')); }
  catch { redirect(`${path}?error=wait`); }
  await setSetting('cj_settlement_max_wait_hours',String(hours));
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

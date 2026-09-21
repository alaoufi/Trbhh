'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { initiateCommercePayment } from '@/lib/commerce/gateway';
import { cancelUnstartedOrder } from '@/lib/commerce/orders';
import { reconcileCommerceOrder } from '@/lib/commerce/reconcile';
import { paymentNotificationTargets } from '@/lib/commerce/notification-policy';
import { dispatchPaidNotification } from '@/lib/commerce/notifications';
import { getMessagingConfig, smsCredsReady, sendSms, sendWhatsApp } from '@/lib/sms';
import { takeSecurityAttempt } from '@/lib/auth-security';

function orderId(form: FormData) {
  const raw = String(form.get('orderId') || '');
  if (!/^[1-9]\d{0,14}$/.test(raw)) throw new Error('invalid_order');
  return BigInt(raw);
}
export async function payCommerceOrder(form: FormData) {
  const session = await requireUser();
  const id = orderId(form);
  const config = await getCommerceConfig();
  const gateway = await getCommerceGateway();
  // مفتاح الشراء المركزي (fail-closed): يُمنع بدء أي دفع حقيقي إذا كان الشراء معطّلاً.
  if (!config.purchasingEnabled) redirect(`/account/orders/${id}?error=purchasing`);
  if (!config.enabled || !config.paymentsEnabled || !gateway?.ready || form.get('confirm') !== '1') redirect(`/account/orders/${id}?error=unavailable`);
  const result = await initiateCommercePayment(prisma, { memberId: BigInt(session.uid), orderId: id }, gateway);
  if (result.status === 'redirect') redirect(result.url);
  revalidatePath(`/account/orders/${id}`);
  redirect(`/account/orders/${id}?payment=${result.status}`);
}
export async function cancelCommerceOrder(form: FormData) {
  const session = await requireUser();
  const id = orderId(form);
  try { await cancelUnstartedOrder(prisma, { memberId: BigInt(session.uid), orderId: id }); }
  catch { redirect(`/account/orders/${id}?error=cancel`); }
  revalidatePath(`/account/orders/${id}`);
  redirect(`/account/orders/${id}`);
}

export async function checkCommercePayment(form: FormData) {
  const session = await requireUser();
  const id = orderId(form);
  if (!(await takeSecurityAttempt(`commerce-inquiry:${session.uid}`, 12))) redirect(`/account/orders/${id}?error=rate`);
  const gateway = await getCommerceGateway();
  if (!gateway?.ready) redirect(`/account/orders/${id}?error=unavailable`);
  const [config, messaging, member] = await Promise.all([
    getCommerceConfig(), getMessagingConfig(),
    prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true } }),
  ]);
  const targets = paymentNotificationTargets(config, { sms: smsCredsReady(messaging), whatsapp: !!(messaging.waInstance && messaging.waToken) },
    { userId: session.uid, phone: member?.phoneNumber || '' });
  let status: string;
  try {
    const result = await reconcileCommerceOrder(prisma, { memberId: BigInt(session.uid), orderId: id }, gateway, targets);
    status = result.status;
    if (result.status === 'paid') {
      // Already-paid replays may deliver still-pending notices but can never
      // create/charge another payment. CAS protects parallel dispatchers.
      const pending = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM commerce_notifications WHERE order_id=${id} AND status='pending' AND channel IN ('sms','whatsapp') LIMIT 50`;
      await Promise.all(pending.map(n => dispatchPaidNotification(prisma, n.id, config, {
        sms: (phone, message) => sendSms(phone, message, messaging),
        whatsapp: (phone, message) => sendWhatsApp(phone, message, messaging),
      })));
    }
  } catch { status = 'action_required'; }
  revalidatePath(`/account/orders/${id}`);
  revalidatePath('/admin/commerce');
  redirect(`/account/orders/${id}?payment=${status}`);
}

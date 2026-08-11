/**
 * قيمة الاسترداد للجزء غير المستخدم من خدمة خاصة.
 *
 * المحفظة الحالية تسجل الرصيد بالريال الصحيح، لذلك يقرّب الاسترداد الكسري
 * لأسفل ولا يغير معيار الأرصدة التاريخية.
 */
export function refundableRiyals(amount: number, startsAt: Date, endsAt: Date, cancelledAt: Date): number {
  const totalDuration = endsAt.getTime() - startsAt.getTime();
  if (!Number.isInteger(amount) || amount <= 0 || totalDuration <= 0) return 0;

  const remainingDuration = Math.min(totalDuration, Math.max(0, endsAt.getTime() - cancelledAt.getTime()));
  return Math.floor((amount * remainingDuration) / totalDuration);
}

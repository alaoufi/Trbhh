/** Only explicit administrative moderation is an admin task. Expiry is handled by subscription access. */
export const pendingStoreWhere = { status: 0 } as const;

export function storeApprovalAction(userId: number) {
  return {
    reason: 'طلب اعتماد متجر أو إعادته للمراجعة؛ السبب التفصيلي القديم غير مسجل.',
    action: 'راجع بيانات المتجر وشروطه ثم اعتمد أو ارفض. الاشتراك والتجربة مستقلان عن الاعتماد.',
    financialHref: `/admin/users/${userId}#wallet`,
  };
}

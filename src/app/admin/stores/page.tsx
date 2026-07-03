import Link from 'next/link';
import { Store, Check, X, Home } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getPendingStores, approvedStoreIds } from '@/lib/merchant';
import { getStores } from '@/lib/stores';
import { timeAgo } from '@/lib/utils';
import { approveStoreAction, requestStoreHomeAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'اعتماد المتاجر' };

export default async function AdminStores() {
  await requireAction('users', 'edit');
  const [pending, all, approvedIds] = await Promise.all([getPendingStores(), getStores(), approvedStoreIds()]);
  const approved = all.filter((s) => approvedIds.has(s.id));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Store className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">اعتماد المتاجر</h1></div>
      <p className="text-sm text-muted-foreground">المتاجر الجديدة تنتظر موافقتك قبل ظهورها للعملاء.</p>
      {pending.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد متاجر بانتظار الاعتماد.</p>}
      <div className="space-y-2">
        {pending.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
            <Link href={`/companies/${s.id}`} className="min-w-0 flex-1">
              <div className="truncate font-bold text-primary">{s.storeName || `متجر #${s.id}`}</div>
              <div className="text-xs text-muted-foreground">التاجر: {s.owner} · {timeAgo(s.at)}</div>
            </Link>
            <form action={approveStoreAction}>
              <input type="hidden" name="storeId" value={s.id} />
              <input type="hidden" name="action" value="approve" />
              <button className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" /> اعتماد</button>
            </form>
            <form action={approveStoreAction}>
              <input type="hidden" name="storeId" value={s.id} />
              <input type="hidden" name="action" value="reject" />
              <button className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive"><X className="h-3.5 w-3.5" /> رفض</button>
            </form>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2"><Home className="h-5 w-5 text-primary" /><h2 className="font-bold text-primary">اطلب عرض متجر في الصفحة الرئيسية</h2></div>
      <p className="text-xs text-muted-foreground">تُرسل طلباً لصاحب المتجر؛ عند قبوله تظهر منتجاته في الرئيسية.</p>
      <div className="space-y-2">
        {approved.map((s) => (
          <div key={s.id} className="flex items-center gap-2 card-3d rounded-xl p-3">
            <Link href={`/companies/${s.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">{s.name}</Link>
            <form action={requestStoreHomeAction}>
              <input type="hidden" name="storeId" value={s.id} />
              <button className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white"><Home className="h-3.5 w-3.5" /> اطلب للرئيسية</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}

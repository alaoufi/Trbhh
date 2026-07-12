import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, ArrowRight, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { requireAction, getUserPermKeys, SERVICES, ACTION_LABELS, ROLE_LABELS, key, type Role } from '@/lib/roles';
import { setUserPermsAction, applyPresetAction } from '@/app/admin/actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'صلاحيات المستخدم' };

const PRESETS: { role: Role | 'none'; label: string }[] = [
  { role: 'manager', label: ROLE_LABELS.manager },
  { role: 'moderator', label: ROLE_LABELS.moderator },
  { role: 'monitor', label: ROLE_LABELS.monitor },
  { role: 'store_monitor', label: ROLE_LABELS.store_monitor },
  { role: 'none', label: 'بدون صلاحيات' },
];

export default async function UserPermissionsPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const uid = Number(id);
  const user = await prisma.users.findUnique({ where: { id: BigInt(uid) }, select: { id: true, name: true, userName: true, phoneNumber: true, is_admin: true } });
  if (!user) notFound();
  const granted = await getUserPermKeys(uid);
  const isRootAdmin = user.is_admin === 1;

  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="h-4 w-4" /> الأعضاء
      </Link>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">صلاحيات: {user.name || user.userName || `#${toInt(user.id)}`}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        فعّل لكل خدمة ما يستطيع فعله (عرض / إضافة / تعديل / حذف / أرشفة). الصلاحية تعمل مباشرة في كل مكان دون الحاجة لدخول الإدارة.
        <br />ملاحظة: <b>الإعلانات</b> لا تتضمّن «تعديل» — يُسمح فقط بالأرشفة أو الحذف حفاظاً على خصوصية الأعضاء.
      </p>

      {sp.saved === '1' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم حفظ الصلاحيات.</div>
      )}
      {isRootAdmin && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          هذا الحساب مدير رئيسي (is_admin) ويملك جميع الصلاحيات تلقائياً. لتقييده أزِل صفة الإدارة الرئيسية من قاعدة البيانات.
        </div>
      )}

      {/* quick presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">تعيين سريع:</span>
        {PRESETS.map((p) => (
          <form key={p.role} action={applyPresetAction}>
            <input type="hidden" name="userId" value={uid} />
            <input type="hidden" name="role" value={p.role} />
            <button className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent">{p.label}</button>
          </form>
        ))}
      </div>

      {/* granular matrix */}
      <form action={setUserPermsAction} className="space-y-3">
        <input type="hidden" name="userId" value={uid} />
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-right">
              <tr>
                <th className="p-3">الخدمة</th>
                {(['view', 'add', 'edit', 'delete', 'archive'] as const).map((a) => (
                  <th key={a} className="p-3 text-center">{ACTION_LABELS[a]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((s) => (
                <tr key={s.key} className="border-b last:border-0">
                  <td className="p-3 font-medium">{s.label}</td>
                  {(['view', 'add', 'edit', 'delete', 'archive'] as const).map((a) => {
                    const available = s.actions.includes(a);
                    const k = key(s.key, a);
                    return (
                      <td key={a} className="p-3 text-center">
                        {available ? (
                          <input type="checkbox" name="perm" value={k} defaultChecked={granted.has(k)} disabled={isRootAdmin} className="h-4 w-4 accent-primary" />
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ConfirmSubmit msg="حفظ الصلاحيات المحددة لهذا العضو؟ تُطبَّق على وصوله للوحة الإدارة فوراً." disabled={isRootAdmin} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">حفظ الصلاحيات</ConfirmSubmit>
      </form>
    </div>
  );
}

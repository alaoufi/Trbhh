import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDeveloperProjects } from '@/lib/projects';
import { getCities } from '@/lib/data';
import { ProjectForm } from '@/components/project-form';
import { deleteProjectAction } from '@/app/projects/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مشاريعي العقارية' };

const STATUS_LABEL: Record<number, string> = { 0: 'بانتظار الاعتماد', 1: 'معتمد', 2: 'موقوف' };
const STATUS_STYLE: Record<number, string> = { 0: 'bg-amber-100 text-amber-800', 1: 'bg-emerald-100 text-emerald-800', 2: 'bg-red-100 text-red-800' };

export default async function AccountProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; deleted?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const license = await prisma.users
    .findUnique({ where: { id: BigInt(session.uid) }, select: { re_license: true } })
    .then((u) => String(u?.re_license || '').trim())
    .catch(() => '');

  const [projects, cities] = await Promise.all([getDeveloperProjects(session.uid), getCities().catch(() => [])]);

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Building2 className="h-5 w-5" /> مشاريعي العقارية</h1>

      {sp.created === '1' && <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✅ تم استلام المشروع — يظهر للعامة بعد اعتماد الإدارة.</div>}
      {sp.deleted === '1' && <div className="rounded-lg border-2 border-secondary bg-secondary/40 p-3 text-sm font-bold">تم حذف المشروع.</div>}
      {sp.error === 'missing' && <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">أكمل بيانات المشروع (الاسم على الأقل).</div>}
      {sp.error === 'blocked' && <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">المحتوى يحوي كلمات غير مسموحة — عدّله وأعد المحاولة.</div>}

      {!license ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-extrabold">🏢 نشر المشاريع مقصور على المطوّرين المرخّصين</p>
          <p className="mt-1 leading-6">أضِف رقم ترخيصك العقاري (فال) في حسابك أولاً ليُفتح لك نشر المشاريع — من صفحة <Link href="/ads/new" className="font-bold underline">«أضف عقار»</Link>.</p>
        </div>
      ) : (
        <>
          {/* مشاريعي الحالية */}
          {projects.length > 0 && (
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p.id} className="card-3d flex items-center justify-between gap-2 rounded-xl p-3">
                  <div className="min-w-0">
                    <Link href={`/projects/${p.id}`} className="line-clamp-1 font-bold text-primary hover:underline">{p.name}</Link>
                    <div className="mt-0.5 text-xs text-muted-foreground">{[p.district, p.cityName].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    <form action={deleteProjectAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-lg border-2 border-red-200 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50">حذف</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* نموذج إضافة مشروع */}
          <div className="flex items-center gap-2 pt-2 text-base font-extrabold text-primary"><Plus className="h-5 w-5" /> إضافة مشروع جديد</div>
          <ProjectForm cities={cities} />
        </>
      )}
    </div>
  );
}

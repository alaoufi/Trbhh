import { redirect, notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getClassifiedById } from '@/lib/classified';
import { ClassifiedForm } from '@/components/classified-form';
import { updateClassifiedAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تعديل الإعلان المبوّب' };

export default async function EditClassifiedPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; price?: string; bal?: string }> }) {
  const session = await requireUser();
  const [{ id }, { error, price, bal }] = await Promise.all([params, searchParams]);
  const c = await getClassifiedById(Number(id));
  if (!c) notFound();
  if (c.userId !== session.uid) redirect('/account/classified');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">تعديل الإعلان المبوّب</h1>
      </div>
      <p className="text-sm text-muted-foreground">عدّل المحتوى أو الشكل ثم احفظ. لتغيير الصورة اختر صورة جديدة، أو اتركها للإبقاء على الحالية.</p>
      <ClassifiedForm
        action={updateClassifiedAction}
        error={error}
        needPrice={price}
        needBal={bal}
        submitLabel="حفظ التعديلات"
        initial={{
          id: c.id, title: c.title, body: c.text, phone: c.phone, whatsapp: c.whatsapp, link: c.link, image: c.image,
          theme: c.theme, pos: c.pos, align: c.align, size: c.size, bold: c.bold, pattern: c.pattern, accent: c.accent, layout: c.layout,
        }}
      />
    </div>
  );
}

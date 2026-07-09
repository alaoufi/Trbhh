import { redirect } from 'next/navigation';

/** الرابط القديم للشرح — يحوّل للموقع الجديد ضمن «الشروحات المتحركة». */
export default function OldTopupGuidePage() {
  redirect('/guide/how/topup');
}

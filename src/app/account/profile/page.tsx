import { getCurrentUser } from '@/lib/auth';
import { ProfileForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الملف الشخصي' };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الملف الشخصي</h1>
      <ProfileForm
        initial={{
          name: user?.name ?? '',
          phoneNumber: user?.phoneNumber ?? '',
          phone_whatsapp: user?.phone_whatsapp ?? '',
          allow_phone: user?.allow_phone === 1,
          whatsapp: user?.whatsapp === 1,
          trusted: user?.trusted === 1,
        }}
      />
    </div>
  );
}

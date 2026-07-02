import { getCurrentUser } from '@/lib/auth';
import { getCities, getAreas } from '@/lib/data';
import { getUserArea } from '@/lib/user-location';
import { toInt } from '@/lib/utils';
import { ProfileForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الملف الشخصي' };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const [cities, areas, areaId] = await Promise.all([
    getCities(),
    getAreas(),
    user ? getUserArea(toInt(user.id)) : Promise.resolve(null),
  ]);
  const regions = cities.filter((c) => c.countryId === 1); // السعودية
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الملف الشخصي</h1>
      <p className="text-sm text-muted-foreground">تُحفظ بياناتك (الجوال، الواتساب، المنطقة والمدينة) تلقائياً من إعلاناتك، ويمكنك تعديلها هنا.</p>
      <ProfileForm
        regions={regions}
        areas={areas}
        initial={{
          name: user?.name ?? '',
          phoneNumber: user?.phoneNumber ?? '',
          phone_whatsapp: user?.phone_whatsapp ?? '',
          allow_phone: user?.allow_phone === 1,
          whatsapp: user?.whatsapp === 1,
          trusted: user?.trusted === 1,
          regionId: user?.city_id ? toInt(user.city_id) : null,
          areaId: areaId,
        }}
      />
    </div>
  );
}

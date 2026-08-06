import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';
export const alt = 'عقار تربح — تستقبل عروضكم وطلباتكم';

/** بطاقة مشاركة «عقار تربح» (Open Graph) — الشعار الرسمي المستقل مُوسَّطاً. */
export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/logo-aqar.png')).catch(() => null);
  const src = logo ? `data:image/png;base64,${logo.toString('base64')}` : '';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#edf1f3' }}>
        {src
          ? <img src={src} width={1080} height={1080} style={{ objectFit: 'cover' }} />
          : <div style={{ display: 'flex', fontSize: 96, color: '#1e3a5f' }}>عقار تربح</div>}
      </div>
    ),
    { ...size },
  );
}

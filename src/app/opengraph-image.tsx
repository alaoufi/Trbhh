import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'منصة تربح للعقار — تستقبل عروضكم وطلباتكم';

/** بطاقة مشاركة «تربح للعقار» (Open Graph) — الشعار الرسمي المستقل مُوسَّطاً. */
export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/logo-aqar.png')).catch(() => null);
  const src = logo ? `data:image/png;base64,${logo.toString('base64')}` : '';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {src
          ? <img src={src} width={600} height={600} style={{ objectFit: 'contain' }} />
          : <div style={{ display: 'flex', fontSize: 64, color: '#1c3560' }}>تربح للعقار</div>}
      </div>
    ),
    { ...size },
  );
}

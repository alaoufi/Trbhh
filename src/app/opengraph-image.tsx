import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'منصة تربح للعقار — تستقبل عروضكم وطلباتكم';

/** بطاقة مشاركة «تربح للعقار» (Open Graph) — تُولَّد كصورة PNG مستقلّة عن علامة تربح. */
export default async function OpengraphImage() {
  const font = await readFile(join(process.cwd(), 'public/fonts/Tajawal-Bold.ttf')).catch(() => null);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          background: 'linear-gradient(135deg, #1c3560 0%, #102340 100%)', color: '#ffffff',
          fontFamily: 'Tajawal', direction: 'rtl',
        }}
      >
        {/* شعار: برج ذهبي + فيلا بيضاء */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 34 }}>
          <div style={{ display: 'flex', width: 96, height: 150, background: '#f0b429', borderRadius: 14 }} />
          <div style={{ display: 'flex', width: 74, height: 108, background: '#ffffff', borderRadius: 14 }} />
          <div style={{ display: 'flex', width: 30, height: 30, background: '#f0b429', borderRadius: 30, marginBottom: 118 }} />
        </div>
        <div style={{ display: 'flex', fontSize: 82, fontWeight: 700, letterSpacing: -1 }}>منصة تربح للعقار</div>
        <div style={{ display: 'flex', fontSize: 44, color: '#f0b429', marginTop: 18 }}>تستقبل عروضكم وطلباتكم</div>
        <div style={{ display: 'flex', fontSize: 26, color: '#cdd6e6', marginTop: 28 }}>agar.trbhh.com</div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'Tajawal', data: font, weight: 700, style: 'normal' }] : undefined,
    },
  );
}

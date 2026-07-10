'use client';
import { useState } from 'react';
import { ImageDown, Loader2 } from 'lucide-react';

export type ShareCardData = { url: string; title: string; desc?: string; price?: string; city?: string; image?: string };

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** يرسم النص من اليمين مع لفّ الأسطر (حتى سطرين + …). */
function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 2) {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines++;
      if (lines >= maxLines) { ctx.fillText(line.slice(0, -1) + '…', x, y); return; }
      ctx.fillText(line, x, y);
      y += lineH;
      line = w;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

/** توليد بطاقة صورة جاهزة للمشاركة (واتساب/سناب/تويتر) من بيانات الإعلان — كلها على جهاز الزائر. */
export function ShareCardButton({ data, className }: { data: ShareCardData; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      const W = 1080, H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // خلفية
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, W, H);
      // رأس بلون الهوية
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#3287da'); grad.addColorStop(1, '#1b4f8a');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 140);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right'; ctx.direction = 'rtl';
      ctx.font = 'bold 56px Cairo, Tahoma, sans-serif';
      ctx.fillText('تربح', W - 48, 90);
      ctx.font = 'bold 30px Cairo, Tahoma, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('trbhh.com', 48, 88);

      // صورة الإعلان
      const imgTop = 140, imgH = 640;
      if (data.image) {
        const img = await loadImg(data.image);
        if (img) {
          const scale = Math.max(W / img.width, imgH / img.height);
          const dw = img.width * scale, dh = img.height * scale;
          ctx.save(); ctx.beginPath(); ctx.rect(0, imgTop, W, imgH); ctx.clip();
          // القصّ من أعلى الصورة (وليس وسطها): الصور الطويلة/النصية يُؤخذ أولها فتبقى مفهومة
          ctx.drawImage(img, (W - dw) / 2, imgTop, dw, dh);
          ctx.restore();
        } else { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, imgTop, W, imgH); }
      } else { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, imgTop, W, imgH); }

      // لوح المحتوى
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(40, imgTop + imgH - 40, W - 80, 460, 28); ctx.fill();
      ctx.textAlign = 'right'; ctx.direction = 'rtl';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 52px Cairo, Tahoma, sans-serif';
      drawWrapped(ctx, data.title, W - 88, imgTop + imgH + 50, W - 176 - 10, 68, 2);
      // السعر
      if (data.price) {
        ctx.fillStyle = '#059669';
        ctx.font = 'bold 58px Cairo, Tahoma, sans-serif';
        ctx.fillText(data.price, W - 88, imgTop + imgH + 205);
      }
      // المدينة
      if (data.city) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 36px Cairo, Tahoma, sans-serif';
        ctx.fillText(`📍 ${data.city}`, W - 88, imgTop + imgH + 275);
      }
      // أول الإعلان (تحت QR حتى لا يتداخلا)
      if (data.desc) {
        ctx.fillStyle = '#475569';
        ctx.font = '32px Cairo, Tahoma, sans-serif';
        drawWrapped(ctx, data.desc, W - 88, imgTop + imgH + 340, W - 176, 44, 2);
      }
      // QR (اختياري — يُتجاهل إن تعذّر تحميله)
      const qr = await loadImg(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`);
      if (qr) {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(72, imgTop + imgH + 80, 216, 216, 16); ctx.fill();
        ctx.drawImage(qr, 80, imgTop + imgH + 88, 200, 200);
      }
      // تذييل
      ctx.fillStyle = '#3287da';
      ctx.font = 'bold 34px Cairo, Tahoma, sans-serif';
      ctx.textAlign = 'center'; ctx.direction = 'ltr';
      ctx.fillText(data.url.replace(/^https?:\/\//, ''), W / 2, H - 60);

      const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png', 0.95));
      if (!blob) return;
      const file = new File([blob], 'trbhh-ad.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        // الرابط يُرفق في نص الرسالة حتى يفتح الإعلان مباشرة
        try { await navigator.share({ files: [file], title: data.title, text: `${data.title}\n${data.url}` }); return; } catch { /* cancelled → fallback */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'trbhh-ad.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={generate} disabled={busy} className={className || 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary'}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4 text-primary" />} بطاقة صورة للمشاركة
    </button>
  );
}

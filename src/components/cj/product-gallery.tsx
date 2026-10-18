'use client';

import { useRef, useState } from 'react';
import { ProductImageZoom } from '@/components/product-image-zoom';
import { CjProductImage } from './product-image';

export function CjProductGallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState(0);
  const touchStart = useRef<number|null>(null);
  const count = images.length;
  const move = (delta: number) => setSelected(index => (index + delta + count) % count);
  return <section aria-label="صور المنتج" className="min-w-0 space-y-2">
    {/* الصورة الرئيسية تملأ المربع (object-cover) بلا تشويه — نفس نمط المتاجر. التكبير يعرضها كاملة. */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white" onTouchStart={event=>{touchStart.current=event.touches[0]?.clientX??null;}} onTouchEnd={event=>{const start=touchStart.current,end=event.changedTouches[0]?.clientX;if(start!==null&&end!==undefined&&Math.abs(end-start)>45&&count>1)move(start>end?1:-1);touchStart.current=null;}}>
      <ProductImageZoom src={images[selected]||''} onPrevious={count>1?()=>move(-1):undefined} onNext={count>1?()=>move(1):undefined} positionLabel={`${selected+1} / ${count}`} alt={title}><CjProductImage src={images[selected]} alt={title} className="aspect-square max-h-[440px] w-full object-contain" /></ProductImageZoom>
    </div>
    {/* مصغّرات فقط (بلا شريط «الصورة X من Y») — الاختيار بالنقر أو السحب. */}
    {count > 1 && <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="اختيار صورة">
      {images.map((src, index) => <button type="button" key={`${src}-${index}`} onClick={() => setSelected(index)} aria-label={`عرض الصورة ${index + 1}`} aria-pressed={selected === index} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white ${selected === index ? 'border-primary' : 'border-slate-200'}`}><CjProductImage src={src} alt="" className="h-full w-full object-cover" /></button>)}
    </div>}

  </section>;
}

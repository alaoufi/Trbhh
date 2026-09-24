'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { CjProductImage } from './product-image';

export function CjProductGallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<number|null>(null);
  const count = images.length;
  const move = (delta: number) => setSelected(index => (index + delta + count) % count);
  return <section aria-label="صور المنتج" className="min-w-0 space-y-3">
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white" onTouchStart={event=>{touchStart.current=event.touches[0]?.clientX??null;}} onTouchEnd={event=>{const start=touchStart.current,end=event.changedTouches[0]?.clientX;if(start!==null&&end!==undefined&&Math.abs(end-start)>45&&count>1)move(start>end?1:-1);touchStart.current=null;}}>
      <CjProductImage src={images[selected]} alt={`${title} — صورة ${selected + 1}`} className="aspect-square max-h-[440px] w-full object-contain p-3" />
      {!!count && <button type="button" onClick={() => dialog.current?.showModal()} aria-label="تكبير صورة المنتج" className="absolute bottom-3 left-3 grid h-11 w-11 place-items-center rounded-full border bg-white/95 text-primary shadow-sm"><Expand className="h-5 w-5" /></button>}
    </div>
    {count > 1 && <>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => move(-1)} aria-label="الصورة السابقة" className="grid h-11 w-11 place-items-center rounded-xl border bg-white"><ChevronRight className="h-5 w-5" /></button>
        <span aria-live="polite" className="text-sm text-slate-600">الصورة {selected + 1} من {count}</span>
        <button type="button" onClick={() => move(1)} aria-label="الصورة التالية" className="grid h-11 w-11 place-items-center rounded-xl border bg-white"><ChevronLeft className="h-5 w-5" /></button>
      </div>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="اختيار صورة">
        {images.map((src, index) => <button type="button" key={`${src}-${index}`} onClick={() => setSelected(index)} aria-label={`عرض الصورة ${index + 1}`} aria-pressed={selected === index} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white ${selected === index ? 'border-primary' : 'border-slate-200'}`}><CjProductImage src={src} alt="" className="h-full w-full object-contain p-1" /></button>)}
      </div>
    </>}
    <dialog ref={dialog} className="m-auto w-[calc(100%_-_1rem)] max-w-4xl rounded-2xl bg-white p-3 backdrop:bg-slate-950/70" aria-label="صورة المنتج مكبرة" onTouchStart={event=>{touchStart.current=event.touches[0]?.clientX??null;}} onTouchEnd={event=>{const start=touchStart.current,end=event.changedTouches[0]?.clientX;if(start!==null&&end!==undefined&&Math.abs(end-start)>45&&count>1)move(start>end?1:-1);touchStart.current=null;}}>
      <div className="mb-2 flex items-center justify-between"><span className="text-sm text-slate-600">الصورة {selected+1} من {count}</span><form method="dialog"><button aria-label="إغلاق الصورة المكبرة" className="grid h-11 w-11 place-items-center rounded-full border"><X className="h-5 w-5" /></button></form></div>
      <div className="flex items-center gap-2">{count>1&&<button type="button" onClick={()=>move(-1)} aria-label="الصورة السابقة" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border"><ChevronRight/></button>}<CjProductImage src={images[selected]} alt={title} className="max-h-[75vh] min-h-40 w-full object-contain" />{count>1&&<button type="button" onClick={()=>move(1)} aria-label="الصورة التالية" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border"><ChevronLeft/></button>}</div>
    </dialog>
  </section>;
}

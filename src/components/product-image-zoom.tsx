"use client";

/* The modal deliberately loads the original source for inspection, rather than a resized thumbnail. */
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { containedImageRect, constrainTransform, lensPosition, pinchTransform, zoomPanelRect, type ImageRect, type ZoomTransform } from '@/lib/product-image-zoom';

type Preview = { image: ImageRect; panel: ImageRect; lens: ReturnType<typeof lensPosition>; scale: number; lensWidth: number; lensHeight: number };
const initial: ZoomTransform = { scale: 1, x: 0, y: 0 };

/** Adds magnification around the existing gallery image without taking over gallery controls. */
export function ProductImageZoom({ src, alt, children, className = '', onPrevious, onNext, positionLabel }: { src: string; alt: string; children: ReactNode; className?: string; onPrevious?: () => void; onNext?: () => void; positionLabel?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const modalImage = useRef<HTMLImageElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [transform, setTransform] = useState(initial);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: ZoomTransform; midpoint: { x: number; y: number }; distance: number } | null>(null);
  const mainGesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const reset = () => { pointers.current.clear(); gesture.current = null; setTransform(initial); };
  useEffect(() => { setPreview(null); setFailed(false); reset(); }, [src]);
  useEffect(() => {
    const clear = () => setPreview(null);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => { window.removeEventListener('scroll', clear, true); window.removeEventListener('resize', clear); };
  }, []);
  useEffect(() => {
    if (!opened) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [opened]);

  function sourceImage() { return root.current?.querySelector('img'); }
  function ready() { const img = sourceImage(); return !!img && img.complete && img.naturalWidth > 0; }
  function open() {
    if (!ready()) return;
    setPreview(null); reset(); setFailed(false); dialog.current?.showModal(); setOpened(true);
  }
  function hover(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || opened) { setPreview(null); return; }
    const img = sourceImage();
    if (!img?.complete || !img.naturalWidth) { setPreview(null); return; }
    const image = containedImageRect(img.getBoundingClientRect(), img.naturalWidth, img.naturalHeight);
    if (!image || event.clientX < image.left || event.clientX > image.left + image.width || event.clientY < image.top || event.clientY > image.top + image.height) { setPreview(null); return; }
    // Do not invent detail by enlarging past the original image resolution.
    const scale = Math.min(3, img.naturalWidth / image.width, img.naturalHeight / image.height);
    if (scale <= 1.05) { setPreview(null); return; }
    const panel = zoomPanelRect(image, window.innerWidth, window.innerHeight);
    const lensWidth = Math.min(image.width, panel.width / scale), lensHeight = Math.min(image.height, panel.height / scale);
    setPreview({ image, panel, scale, lensWidth, lensHeight, lens: lensPosition(image, event.clientX, event.clientY, lensWidth, lensHeight) });
  }
  function imageSize() {
    const img = modalImage.current;
    if (!img || !viewport.current) return null;
    return containedImageRect(viewport.current.getBoundingClientRect(), img.naturalWidth, img.naturalHeight);
  }
  function gesturePoints() {
    const points = Array.from(pointers.current.values());
    const bounds = viewport.current!.getBoundingClientRect();
    const a = points[0], b = points[1] || a;
    return { midpoint: { x: (a.x + b.x) / 2 - bounds.left - bounds.width / 2, y: (a.y + b.y) / 2 - bounds.top - bounds.height / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  function rebase() {
    if (!pointers.current.size) { gesture.current = null; return; }
    gesture.current = { start: transform, ...gesturePoints() };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); rebase();
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const size = imageSize(); if (!size) return;
    const current = gesturePoints(), start = gesture.current;
    if (pointers.current.size > 1 && start.distance > 0) setTransform(pinchTransform(start.start, start.midpoint, current.midpoint, current.distance / start.distance, size.width, size.height));
    else setTransform(constrainTransform({ ...start.start, x: start.start.x + current.midpoint.x - start.midpoint.x, y: start.start.y + current.midpoint.y - start.midpoint.y }, size.width, size.height));
  }
  function up(event: PointerEvent<HTMLDivElement>) { pointers.current.delete(event.pointerId); rebase(); }
  function zoom(delta: number) { const size = imageSize(); if (size) setTransform(value => constrainTransform({ ...value, scale: value.scale + delta }, size.width, size.height)); }

  return <div ref={root} className={`relative ${className}`} onPointerDown={event => {
    if ((event.target as HTMLElement).closest('dialog')) return;
    mainGesture.current = { x: event.clientX, y: event.clientY, moved: false };
  }} onPointerMove={event => {
    const start = mainGesture.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
    hover(event);
  }} onPointerCancel={() => { if (mainGesture.current) mainGesture.current.moved = true; }} onPointerLeave={() => setPreview(null)} onClick={event => {
    if ((event.target as HTMLElement).closest('button, a, dialog')) return;
    if (mainGesture.current?.moved) { mainGesture.current = null; return; }
    mainGesture.current = null;
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) open();
  }}>
    {children}
    <button type="button" aria-label={`تكبير صورة ${alt}`} onClick={open} className="absolute bottom-3 left-3 z-10 rounded-full border bg-white/95 px-3 py-2 text-sm text-slate-900 shadow hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">تكبير ⤢</button>
    {preview && createPortal(<div aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'fixed', zIndex: 100, left: preview.lens.left, top: preview.lens.top, width: preview.lensWidth, height: preview.lensHeight, border: '2px solid #2563eb', background: 'rgba(59,130,246,.16)' }} />
      <div data-product-zoom-preview style={{ position: 'fixed', zIndex: 101, ...preview.panel, border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 10px 30px #0003', backgroundColor: 'white', backgroundImage: `url(${JSON.stringify(src)})`, backgroundRepeat: 'no-repeat', backgroundSize: `${preview.image.width * preview.scale}px ${preview.image.height * preview.scale}px`, backgroundPosition: `${preview.panel.width / 2 - (preview.lens.centerX - preview.image.left) * preview.scale}px ${preview.panel.height / 2 - (preview.lens.centerY - preview.image.top) * preview.scale}px` }} />
    </div>, document.body)}
    <dialog ref={dialog} aria-label={`صورة ${alt} مكبرة`} onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()} onTouchCancel={event => event.stopPropagation()} onClose={() => { setOpened(false); reset(); }} className="m-auto h-[95dvh] max-h-[95dvh] w-[96vw] max-w-6xl overflow-hidden rounded-xl bg-white p-0 text-slate-900 backdrop:bg-black/80">
      <div className="flex h-14 items-center justify-between gap-3 border-b px-4">
        <span className="truncate text-sm">{alt}</span>
        <div className="flex shrink-0 items-center gap-2">
          {onPrevious && <button type="button" aria-label="الصورة السابقة" onClick={onPrevious} className="rounded border px-2 py-1">→</button>}
          {positionLabel && <span className="text-xs" dir="ltr">{positionLabel}</span>}
          {onNext && <button type="button" aria-label="الصورة التالية" onClick={onNext} className="rounded border px-2 py-1">←</button>}
          <button type="button" aria-label="تصغير" onClick={() => zoom(-0.5)} disabled={transform.scale <= 1} className="rounded border px-3 py-1 disabled:opacity-40">−</button>
          <button type="button" aria-label="إعادة ضبط التكبير" onClick={reset} className="rounded border px-2 py-1">{Math.round(transform.scale * 100)}%</button>
          <button type="button" aria-label="تكبير" onClick={() => zoom(0.5)} disabled={transform.scale >= 4} className="rounded border px-3 py-1 disabled:opacity-40">+</button>
          <button type="button" autoFocus aria-label="إغلاق الصورة المكبرة" onClick={() => dialog.current?.close()} className="rounded border px-3 py-1">✕</button>
        </div>
      </div>
      <div ref={viewport} className="relative flex h-[calc(100%_-_3.5rem)] items-center justify-center overflow-hidden" style={{ touchAction: 'none', cursor: transform.scale > 1 ? 'grab' : 'default' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
        {opened && !failed && <img ref={modalImage} src={src} alt={alt} draggable={false} onError={() => setFailed(true)} className="h-full w-full select-none object-contain" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: 'center' }} />}
        {failed && <p role="status">تعذر تحميل الصورة</p>}
      </div>
    </dialog>
  </div>;
}

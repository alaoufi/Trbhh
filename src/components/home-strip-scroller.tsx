'use client';
import {useEffect,useRef,useState} from 'react';

export function HomeStripScroller({children,title,autoPlay}:{children:React.ReactNode;title:string;autoPlay:boolean}){
 const ref=useRef<HTMLDivElement>(null),hover=useRef(false),focus=useRef(false);
 const touching=useRef(false),resumeAt=useRef(0);
 const resumeAfterInteraction=()=>{touching.current=false;resumeAt.current=performance.now()+1500;};
 const [paused,setPaused]=useState(false);
 useEffect(()=>{
  const el=ref.current;if(!el||!autoPlay||paused)return;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,last=0,direction=-1,visible=false,position=el.scrollLeft;
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;});observer.observe(el);
  const tick=(now:number)=>{
   const dt=last?Math.min(now-last,50):0;last=now;
   if(visible&&!document.hidden&&!media.matches&&!hover.current&&!focus.current&&!touching.current&&now>=resumeAt.current){
    const max=el.scrollWidth-el.clientWidth;
    if(max>1){if(position<=-max)direction=1;else if(position>=0)direction=-1;position=Math.max(-max,Math.min(0,position+direction*dt*0.02));el.scrollLeft=position;}
   }else position=el.scrollLeft;
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();};
 },[autoPlay,paused]);
 return <>
  {autoPlay&&<button type="button" className="mb-1 min-h-9 rounded-lg border border-primary/20 px-2 text-xs text-primary" aria-pressed={paused} onClick={()=>setPaused(v=>!v)}>{paused?'تشغيل الحركة':'إيقاف الحركة'}</button>}
  <div ref={ref} dir="rtl" role="region" aria-label={title} tabIndex={0} data-strip-scroller onPointerEnter={e=>{hover.current=e.pointerType==='mouse';}} onPointerLeave={()=>{hover.current=false;}} onFocusCapture={e=>{focus.current=e.target.matches(':focus-visible');}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))focus.current=false;}} onTouchStart={()=>{touching.current=true;}} onTouchEnd={resumeAfterInteraction} onTouchCancel={resumeAfterInteraction} onWheel={()=>{resumeAt.current=performance.now()+1500;}} className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{children}</div>
 </>;
}

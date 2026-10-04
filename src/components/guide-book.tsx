'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,List,Search,X} from 'lucide-react';
import Image from 'next/image';
import {guideGroup,guideHashIndex,searchGuide,type GuideChapter} from '@/lib/guide-book';
import styles from './guide-book.module.css';

export function GuideBook({topId,title,subtitle,sections,children}:{topId:string;title:string;subtitle:string;sections:GuideChapter[];children?:React.ReactNode}){
 const [active,setActive]=useState(0),[ready,setReady]=useState(false),[query,setQuery]=useState(''),[indexOpen,setIndexOpen]=useState(false),[animate,setAnimate]=useState(false);
 const [image,setImage]=useState<{src:string;alt:string}|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),focusPage=useRef(false),indexRef=useRef<HTMLElement>(null);
 const matches=useMemo(()=>searchGuide(sections,query),[sections,query]);
 const groups=useMemo(()=>Array.from(new Set(sections.map(guideGroup))),[sections]);
 useEffect(()=>{
  function sync(){const index=guideHashIndex(sections,window.location.hash);if(index>=0){setActive(index);focusPage.current=true;}else if(!window.location.hash)setActive(0);else if(window.location.hash==='#guide-index')setIndexOpen(true);setReady(true);}
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
  return ()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
 },[sections]);
 useEffect(()=>{
  if(ready&&focusPage.current){document.getElementById(`${topId}-heading-${active}`)?.focus();focusPage.current=false;}
 },[active,ready,topId]);
 useEffect(()=>{if(image&&!dialog.current?.open)dialog.current?.showModal();},[image]);
 function go(index:number){
  if(index<0||index>=sections.length)return;
  focusPage.current=true;setActive(index);setIndexOpen(false);
  window.history.pushState(null,'',`#${encodeURIComponent(sections[index].id)}`);
  if(index===active){document.getElementById(`${topId}-heading-${index}`)?.focus();focusPage.current=false;}
 }
 function showIndex(){setIndexOpen(true);requestAnimationFrame(()=>indexRef.current?.querySelector<HTMLInputElement>('input')?.focus());}
 return <div id={topId} dir="rtl" data-guide-book data-enhanced={ready?'true':'false'} className={styles.book}>
  <header className={styles.cover}><div className={styles.brand}><BookOpen aria-hidden="true" size={26}/><span>مكتبة تربح · دليل تفاعلي</span></div><h1>{title}</h1><p>{subtitle}</p><div className={styles.coverMeta}><span>{sections.length} موضوعًا</span><span>اقرأ · ابحث · انتقل مباشرة</span></div></header>
  {children&&<details className={styles.quick}><summary>البداية السريعة والاختصارات</summary><div>{children}</div></details>}
  <div className={styles.binding}>
   <button type="button" className={styles.mobileIndex} aria-expanded={indexOpen} aria-controls={`${topId}-index`} onClick={()=>setIndexOpen(!indexOpen)}><List aria-hidden="true" size={19}/>الفهرس والبحث</button>
   <aside id={`${topId}-index`} ref={indexRef} className={`${styles.index} ${indexOpen?styles.indexOpen:''}`} aria-label="فهرس الدليل">
    <div id="guide-index" className={styles.indexTitle}><BookOpen size={18} aria-hidden="true"/><h2>فهرس الكتاب</h2></div>
    <label className={styles.searchLabel} htmlFor={`${topId}-search`}>ابحث داخل الدليل</label>
    <div className={styles.search}><Search aria-hidden="true" size={18}/><input id={`${topId}-search`} type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} placeholder="موضوع، حقل، أو خدمة…"/>{query&&<button type="button" aria-label="مسح البحث" onClick={()=>setQuery('')}><X size={17}/></button>}</div>
    <p role="status" className={styles.resultCount}>{query?`${matches.length} موضوع مطابق`:'اختر الموضوع الذي تحتاجه'}</p>
    <nav aria-label="موضوعات الدليل" className={styles.chapters}>
     {!matches.length&&<p className={styles.noResults}>لا توجد نتائج. جرّب كلمة أخرى أو امسح البحث.</p>}
     {groups.map(group=>{const items=matches.filter(i=>guideGroup(sections[i])===group);if(!items.length)return null;return <section key={group} className={styles.group}><h3>{group}</h3>{items.map(i=><a key={sections[i].id} href={`#${sections[i].id}`} aria-current={ready&&active===i?'page':undefined} onClick={e=>{e.preventDefault();go(i);}}><span className={styles.chapterNumber}>{i+1}</span><span>{sections[i].title}</span></a>)}</section>;})}
    </nav>
   </aside>
   <div className={styles.reading} role="region" aria-label="صفحات الدليل">
    {ready&&<div className={styles.toolbar}><span role="status">صفحة {sections.length?active+1:0} من {sections.length}</span><label><input type="checkbox" checked={animate} onChange={e=>setAnimate(e.target.checked)}/>حركة تقليب خفيفة</label></div>}
    {!sections.length&&<p className={styles.page}>لا توجد موضوعات متاحة حاليًا.</p>}
    {sections.map((section,i)=><article key={section.id} id={section.id} hidden={ready&&active!==i} className={`${styles.page} ${animate?styles.animated:''}`}>
     <div className={styles.chapterTag}>{guideGroup(section)} · {String(i+1).padStart(2,'0')}</div>
     <h2 id={`${topId}-heading-${i}`} tabIndex={-1}>{section.title}</h2>
     <p className={styles.goal}>{section.goal}</p>
     <h3 className={styles.stepsTitle}>خطوة بخطوة</h3><ol className={styles.steps}>{section.steps.map((step,j)=><li key={j}><span aria-hidden="true">{j+1}</span><p>{step}</p></li>)}</ol>
     {section.images?.map(picture=><figure key={picture.src} className={styles.figure}><button type="button" onClick={()=>setImage(picture)} aria-label={`تكبير: ${picture.alt}`}><Image unoptimized src={picture.src} alt={picture.alt} width={780} height={900} className={styles.picture}/></button><figcaption>{picture.alt} — اضغط للتكبير.</figcaption></figure>)}
     {!!section.links?.length&&<div className={styles.routeMap}><h3>القائمة والروابط المرتبطة بالموضوع</h3><div>{section.links.map(link=><a key={link.href} href={link.href}><span aria-hidden="true">↗</span>{link.label}</a>)}</div></div>}
     <a className={styles.backIndex} href="#guide-index" onClick={e=>{e.preventDefault();showIndex();}}><List size={17} aria-hidden="true"/>العودة للفهرس والبحث</a>
    </article>)}
    {ready&&sections.length>0&&<nav className={styles.pager} aria-label="تقليب صفحات الدليل"><button type="button" disabled={active===0} onClick={()=>go(active-1)}><ChevronRight aria-hidden="true" size={18}/>السابق</button><span>{active+1} / {sections.length}</span><button type="button" disabled={active===sections.length-1} onClick={()=>go(active+1)}>التالي<ChevronLeft aria-hidden="true" size={18}/></button></nav>}
   </div>
  </div>
  <dialog ref={dialog} className={styles.dialog} aria-label="تكبير اللقطة التوضيحية" onClose={()=>setImage(null)} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><button type="button" autoFocus onClick={()=>dialog.current?.close()} className={styles.close}>إغلاق الصورة <X size={19}/></button>{image&&<Image unoptimized src={image.src} alt={image.alt} width={780} height={900} className={styles.picture}/>}</dialog>
 </div>;
}

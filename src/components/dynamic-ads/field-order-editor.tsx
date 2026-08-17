'use client';
import { useState } from 'react';
import type { DynamicField } from '@/lib/dynamic-ads/schema';

export function FieldOrderEditor({ fields, action }: { fields: DynamicField[]; action: (formData: FormData) => void | Promise<void> }) {
  const [items, setItems] = useState([...fields].sort((a,b)=>(a.inputOrder??999)-(b.inputOrder??999)));
  const [dragged, setDragged] = useState<number | null>(null);
  async function drop(target: number) {
    if (dragged === null || dragged === target) return;
    const from = items.findIndex(item=>item.id===dragged), to = items.findIndex(item=>item.id===target);
    const next=[...items]; const [moved]=next.splice(from,1); next.splice(to,0,moved); setItems(next);
    await Promise.all(next.map((item,index)=>{ const data=new FormData(); data.set('id',String(item.id)); data.set('input_order',String((index+1)*10)); data.set('display_order',String(item.displayOrder??(index+1)*10)); return action(data); }));
  }
  return <div className="space-y-2">{items.map(field=><div key={field.id} draggable onDragStart={()=>setDragged(field.id??null)} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(field.id??0)} className="cursor-grab rounded-lg border bg-white p-2 text-sm active:cursor-grabbing"><span className="ml-2 text-primary">↕</span><b>{field.label}</b><span className="mr-2 text-slate-500">{field.type}</span></div>)}</div>;
}

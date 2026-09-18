'use client';
import {useEffect,useState} from 'react';
import {ChevronDown,Search,LayoutGrid} from 'lucide-react';
import Link from 'next/link';
import {catalog} from '../lib/category-fields';
import {applyFieldSettings,FIELD_SETTINGS_KEY,type FieldSettings} from '../lib/field-settings';
import {readLocal} from '../lib/preview';
import './catalog-management.css';
export function CategoryDropdown(){
  const [settings,setSettings]=useState<FieldSettings>({});
  const [query,setQuery]=useState('');
  useEffect(()=>setSettings(readLocal(FIELD_SETTINGS_KEY,{})),[]);
  return <details className="category-dropdown" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
    <summary><span><LayoutGrid size={22}/><strong>تصفح الأقسام</strong><small>اختر المجال والفرع المناسب</small></span><ChevronDown size={20}/></summary>
    <div className="category-dropdown-body"><label className="category-dropdown-search"><Search size={18}/><input aria-label="ابحث عن قسم" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن عقار، سيارة، وظيفة…" /></label>
      <div className="category-dropdown-grid">{Object.entries(catalog).map(([name,branches])=>{
        const visible=Object.keys(branches).filter(branch=>applyFieldSettings(branches[branch],settings?.[name+'/'+branch]) && (!query || (name+' '+branch).includes(query)));
        return visible.length ? <div key={name}><Link className="category-dropdown-title" href={`/search/?category=${encodeURIComponent(name)}`}>{name}</Link><div>{visible.map(branch=><Link key={branch} href={`/search/?category=${encodeURIComponent(name)}&subcategory=${encodeURIComponent(branch)}`}>{branch}</Link>)}</div></div> : null;
      })}</div>
      <Link className="button secondary" href="/search/">عرض جميع الإعلانات</Link>
    </div>
  </details>;
}

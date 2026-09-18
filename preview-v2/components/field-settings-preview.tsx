'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { catalog, type Field } from '../lib/category-fields';
import { FIELD_SETTINGS_KEY, applyFieldSettings, type FieldSettings, type BranchSettings, type FieldOverride, optionsLocked, normalizeOptions, settingsErrors } from '../lib/field-settings';
import { readLocal, writeLocal } from '../lib/preview';
import './seller.css';
import './category-details.css';

export function FieldSettingsPreview() {
  const [settings, setSettings] = useState<FieldSettings>({});
  const [category, setCategory] = useState('عقارات');
  const [branch, setBranch] = useState('أراضٍ');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<Field['type']>('text');
  const [options, setOptions] = useState('');
  useEffect(() => { const stored = readLocal<FieldSettings>(FIELD_SETTINGS_KEY, {}); setSettings(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}); setReady(true); }, []);
  const key = `${category}/${branch}`;
  const current = settings[key] || {};
  const base = catalog[category][branch];
  const allFields = [...base.fields, ...(current.added || [])];
  function change(update: BranchSettings) { setSettings(value => ({...value, [key]:{...value[key], ...update}})); setMessage('تعديلات غير محفوظة'); }
  function edit(id: string, update: FieldOverride) { change({fields:{...current.fields, [id]:{...current.fields?.[id], ...update}}}); }
  function save() {
    const issues = Object.entries(settings).flatMap(([path, config]) => { const [categoryName,branchName]=path.split('/'); const profile=catalog[categoryName]?.[branchName]; return profile ? settingsErrors(profile,config) : []; });
    if (issues.length) { setMessage(issues.join(' ')); return; }
    writeLocal(FIELD_SETTINGS_KEY, settings); setMessage(JSON.stringify(readLocal(FIELD_SETTINGS_KEY, {})) === JSON.stringify(settings) ? 'حُفظت إعدادات الحقول في هذا المتصفح فقط.' : 'تعذر الحفظ. لم تتغير الإعدادات المحفوظة.'); }
  return <div className="container seller-page"><div className="seller-page-head"><div><h1>إعدادات حقول الأقسام</h1><p>معاينة أدوات الإدارة — لا تتصل بقاعدة بيانات الموقع الحي.</p></div><Link className="button secondary" href="/ads/new/">تجربة إضافة إعلان</Link></div><div className="seller-demo-note">يمكن لأي زائر تجربة هذه الصفحة. الإعدادات محلية له وحده، وليست لوحة إدارة فعلية أو صلاحيات على الموقع. إخفاء أو أرشفة حقل لا يحذف الإعلانات المحفوظة.</div><section className="seller-form-panel"><div className="seller-fields">
    <div className="seller-field-row"><label className="seller-field">القسم الرئيسي<select value={category} onChange={e => {setCategory(e.target.value);setBranch(Object.keys(catalog[e.target.value])[0]);}}>{Object.keys(catalog).map(c => <option key={c}>{c}</option>)}</select></label><label className="seller-field">القسم الفرعي<select value={branch} onChange={e => setBranch(e.target.value)}>{Object.keys(catalog[category]).map(b => <option key={b}>{b}</option>)}</select></label></div>
    <label className="category-settings-check"><input type="checkbox" checked={current.enabled !== false} onChange={e => change({enabled:e.target.checked})} />تفعيل هذا الفرع في نموذج إضافة الإعلان</label><p className="category-profile-note">{applyFieldSettings(base, current)?.fields.length || 0} حقل ظاهر. الحقول الشرطية لا تظهر إلا عند تحقق شرطها. تغيير القائمة قد يستدعي مراجعة قيم المسودات القديمة.</p>
    <div className="category-admin-list">{allFields.map(f => { const override=current.fields?.[f.id] || {}; return <div className="category-admin-row" key={f.id}><label className="seller-field">اسم الحقل<input aria-label={`اسم ${f.label}`} value={override.label ?? f.label} maxLength={80} onChange={e => edit(f.id,{label:e.target.value})} /><small>{f.group}{f.when ? ' · شرطي' : ''}</small></label><div className="category-admin-controls"><label><input type="checkbox" checked={!override.hidden} onChange={e => edit(f.id,{hidden:!e.target.checked})} />ظاهر</label><label><input type="checkbox" checked={override.required ?? f.required ?? false} onChange={e => edit(f.id,{required:e.target.checked})} />إجباري</label><button type="button" onClick={() => edit(f.id,{hidden:true})}>أرشفة الحقل</button></div>{f.options && <label className="seller-field category-wide">{optionsLocked(base,f.id) ? 'خيارات مرتبطة بقواعد النموذج (ثابتة لحماية الشروط)' : 'الخيارات — افصل بينها بعلامة |'}<input disabled={optionsLocked(base,f.id)} title={optionsLocked(base,f.id) ? 'قيم مرتبطة بشروط الحقول والتسعير؛ يمكن تعديل اسم الحقل وإظهاره فقط.' : undefined} value={(override.options || f.options).join('|')} maxLength={2000} onChange={e => edit(f.id,{options:e.target.value.split('|')})} /></label>}</div>; })}</div>
    <fieldset className="category-field-group"><legend>إضافة حقل لهذا الفرع فقط</legend><div className="category-field-grid"><label className="seller-field">اسم الحقل الجديد<input value={label} maxLength={80} onChange={e => setLabel(e.target.value)} /></label><label className="seller-field">نوع الحقل<select value={type} onChange={e => setType(e.target.value as Field['type'])}><option value="text">نص</option><option value="number">رقم</option><option value="select">قائمة</option><option value="date">تاريخ</option></select></label>{type==='select' && <label className="seller-field">خيارات الحقل<input value={options} onChange={e => setOptions(e.target.value)} placeholder="الخيار الأول|الخيار الثاني" maxLength={2000} /></label>}<button className="button secondary" type="button" disabled={!label.trim() || (type==='select' && !normalizeOptions(options.split('|')).length) || (current.added?.length || 0)>=30} onClick={() => {change({added:[...(current.added || []),{id:`custom${Date.now()}`,label:label.trim(),type,group:'تفاصيل إضافية',...(type==='select'?{options:normalizeOptions(options.split('|'))}:{})}]});setLabel('');setOptions('');}}>إضافة الحقل</button></div></fieldset>
    <div className="seller-inline"><button className="button primary" disabled={!ready} onClick={save}>حفظ إعدادات الحقول</button><button className="button secondary" onClick={() => {const next={...settings};delete next[key];setSettings(next);setMessage('استعدت التعريف الافتراضي لهذا الفرع. اضغط حفظ للتطبيق.');}}>استعادة حقول هذا الفرع</button><span role="status">{message}</span></div>
  </div></section></div>;
}

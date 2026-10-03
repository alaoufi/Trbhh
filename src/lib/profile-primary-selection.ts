/** Legacy duplicate primary rows remain for historical ad attribution, not as extra accounts. */
export function distinctPublishingProfiles<T extends {id:number;type:string;isDefault:boolean}>(rows:T[],activeId:number):T[]{
 const primaries=rows.filter(p=>p.type==='personal'&&p.isDefault);
 const selected=primaries.find(p=>p.id===activeId)??primaries[0];
 return rows.filter(p=>p.type!=='personal'||!p.isDefault||p.id===selected?.id);
}

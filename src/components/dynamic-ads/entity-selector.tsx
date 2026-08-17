'use client';

type EntityOption = { id: number; name: string; icon: string };

export function EntitySelector({ entities, selectedId, className }: { entities: EntityOption[]; selectedId?: number; className: string }) {
  return <form className="mt-3 flex max-w-md gap-2">
    <select name="entity" defaultValue={selectedId ? String(selectedId) : ''} className={className} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.icon} {entity.name}</option>)}
    </select>
    <button className="rounded-lg border px-3 text-sm font-bold text-primary">عرض</button>
  </form>;
}

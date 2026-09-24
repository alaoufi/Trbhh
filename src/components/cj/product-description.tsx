import { cjDescriptionText, cjSourceLink } from '@/lib/cj/presentation';

export function CjProductDescription({ text }: { text: string }) {
  const clean = cjDescriptionText(text);
  if (!clean) return <p className="text-sm text-slate-500">لم يُضف وصف عربي مكتمل لهذا المنتج بعد.</p>;
  return <div className="min-w-0 space-y-3 text-sm leading-8 [overflow-wrap:anywhere]">
    {clean.split(/\n{2,}/).map((paragraph, index) => <p key={index} className="whitespace-pre-line">
      {paragraph.split(/(https?:\/\/[^\s<>]+)/g).map((part, partIndex) => {
        const link = /^https?:\/\//.test(part) ? cjSourceLink(part) : null;
        return link ? <a key={partIndex} href={link.href} rel="noopener noreferrer nofollow" target="_blank" className="inline-block max-w-full rounded bg-slate-100 px-2 text-primary underline">{link.label}</a> : part;
      })}
    </p>)}
  </div>;
}

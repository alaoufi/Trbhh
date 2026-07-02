import { patternStyle, type Pattern, type Accent } from '@/lib/classified-theme';

const GOLD = '#d4a017';

/** Decorative pattern overlay + accent element. No hooks → works in server & client. */
export function ClassifiedDecor({ pattern, accent, dark }: { pattern: Pattern; accent: Accent; dark: boolean }) {
  return (
    <>
      {pattern !== 'none' && (
        <div className="pointer-events-none absolute inset-0 z-[1]" style={patternStyle(pattern, dark)} />
      )}
      {accent === 'bar' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1.5" style={{ background: GOLD }} />
      )}
      {accent === 'corner' && (
        <div className="pointer-events-none absolute left-0 top-0 z-[2] h-0 w-0 border-b-[40px] border-l-[40px] border-b-transparent" style={{ borderLeftColor: GOLD }} />
      )}
      {accent === 'frame' && (
        <div className="pointer-events-none absolute inset-2 z-[2] rounded-xl border-2" style={{ borderColor: `${GOLD}cc` }} />
      )}
    </>
  );
}

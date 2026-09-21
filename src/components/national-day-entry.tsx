'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './national-day-entry.module.css';

type Phase = 'idle' | 'flag' | 'leaders';
const SESSION_KEY = 'trbhh:national-day-2026:intro-seen';

export function NationalDayEntry({ active }: { active: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<number[]>([]);
  const dismiss = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPhase('idle');
  }, []);

  useEffect(() => {
    if (!active) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, 'seen');
    } catch { /* Storage can be blocked; the visual remains safe for this page load. */ }
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = motion?.matches === true;
    if (reduced) {
      setPhase('leaders');
      timers.current = [window.setTimeout(() => setPhase('idle'), 2400)];
    } else {
      setPhase('flag');
      timers.current = [
        window.setTimeout(() => setPhase('leaders'), 1800),
        window.setTimeout(() => setPhase('idle'), 5000),
      ];
    }
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [active]);

  if (!active) return null;
  return <div data-national-day-entry="true" data-phase={phase} className={styles.entry} aria-live="polite">
    <div className={styles.flagStage} aria-hidden={phase !== 'flag'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/national-day/saudi-flag.svg" alt="علم المملكة العربية السعودية" className={styles.flag} />
      <p>راية التوحيد.. شامخة دائمًا</p>
    </div>
    <div className={styles.leadersStage} aria-hidden={phase !== 'leaders'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/national-day/leadership.webp" alt="خادم الحرمين الشريفين الملك سلمان وسمو ولي العهد الأمير محمد بن سلمان" />
      <div className={styles.leadersCopy}>
        <strong>دام عزك يا وطن</strong>
        <span>قيادة طموحة.. وشعب يصنع المستقبل</span>
      </div>
    </div>
    <button type="button" onClick={dismiss} className={styles.skip}>تخطي</button>
  </div>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { allowAutomaticPrompt, claimPromptSession, dismissPrompt, promptDismissed } from '@/lib/prompt-policy';

let memorySlot = '';
const memoryDismissals = new Set<string>();

/** Delayed, coordinated prompts with a safe fallback when browser storage is blocked. */
export function useAutomaticPrompt(key: string, enabled: boolean, delayMs: number) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    if (!enabled || !allowAutomaticPrompt(pathname) || promptDismissed(key, () => localStorage, memoryDismissals)) return;

    const timer = setTimeout(() => {
      let granted = false;
      try { granted = claimPromptSession(sessionStorage, key); }
      catch { granted = !memorySlot || memorySlot === key; }
      if (!granted || (memorySlot && memorySlot !== key)) return;
      memorySlot = key;
      setOpen(true);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [key, enabled, delayMs, pathname]);
  const dismiss = useCallback(() => {
    dismissPrompt(key, () => localStorage, memoryDismissals);

    setOpen(false);
  }, [key]);
  return { open, dismiss };
}

'use client';
import { useEffect } from 'react';

/**
 * Marks the classified splash as "seen" for this session so it never appears
 * when the visitor arrives via a STORE context (independent store — no Trbhh
 * classified detour). Renders nothing. Its effect runs before the splash's
 * (page children commit before the layout footer), so the splash stays hidden.
 */
export function SplashSuppress() {
  useEffect(() => {
    try { sessionStorage.setItem('trbhh_splash_seen', '1'); } catch { /* ignore */ }
  }, []);
  return null;
}

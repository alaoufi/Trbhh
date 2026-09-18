'use client';
import { resolveSiteDesign } from './site-design';

export function applyDesign(raw: string, enabled = false) {
  const id = resolveSiteDesign(raw, enabled);
  if (typeof window === 'undefined' || typeof document === 'undefined') return id;
  const el = document.documentElement;
  if (id) el.setAttribute('data-design', id);
  else el.removeAttribute('data-design');
  document.cookie = `design=${id}; path=/; max-age=31536000; samesite=lax`;
  return id;
}

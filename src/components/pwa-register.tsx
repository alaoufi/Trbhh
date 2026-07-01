'use client';
import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const onLoad = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if (document.readyState === 'complete') onLoad();
      else window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);
  return null;
}

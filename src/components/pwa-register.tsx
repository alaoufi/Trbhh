'use client';
import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Version the URL as well as the cache: a CDN may otherwise serve an old
      // worker for its cache lifetime after a production deployment.
      const onLoad = () => navigator.serviceWorker.register('/sw.js?v=8').catch(() => {});
      if (document.readyState === 'complete') onLoad();
      else window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);
  return null;
}

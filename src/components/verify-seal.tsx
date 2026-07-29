'use client';
import { useEffect, useRef } from 'react';

/**
 * ختم التوثيق «متجر موثّق» — المركز السعودي للأعمال (eauthenticate.saudibusiness.gov.sa).
 * نزرع عنصر الختم ثم نُحمّل seal.js بجانبه (كما في التعليمات الرسمية بالضبط) لضمان أن يجده
 * السكربت ويرسم الشارة فيه — بدل رفعه بعيداً عبر next/script.
 */
export function VerifySeal({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sbc-seal-js')) return; // تحميل مرّة واحدة
    const s = document.createElement('script');
    s.id = 'sbc-seal-js';
    s.src = 'https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);
  return <div ref={ref} className={`sbc-verify-seal ${className}`} data-token="dklvcSt3ZUxBNGwrRlQ5TTN4SjBxdz09" />;
}

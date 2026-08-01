'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * خريطة العقار (قراءة فقط) — المنصّة العقارية. تعرض موقع العقار مع مبدّل طبقات:
 *  • «قمر صناعي» (صور Esri الجوية) لرؤية الأرض/القطعة والمخطط على الطبيعة — الطبقة الافتراضية.
 *  • «خريطة» شوارع OpenStreetMap.
 * وتُظهر رقم المخطط/القطعة كبطاقة على الخريطة. صور الأقمار مجانية بلا مفتاح.
 * ملاحظة: حدود القطع/المخططات الرسمية بأرقامها مملوكة لبلدي (وزارة البلديات) وسهيل (الهيئة
 * العامة للعقار) ولا تتوفّر كطبقة عامة قابلة للتضمين — نعرض هنا الموقع والصورة الجوية والأرقام،
 * مع روابط للمصدر الرسمي للتحقّق من المخطط.
 * يُحمَّل في المتصفح فقط (dynamic ssr:false) لأن Leaflet يتطلّب window.
 */
export function PropertyMap({
  lat,
  lng,
  plot,
  plan,
  height = 320,
}: {
  lat: number;
  lng: number;
  plot?: string | null;
  plan?: string | null;
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { center: [lat, lng], zoom: 17, scrollWheelZoom: false });

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'صور الأقمار © Esri',
    });
    // أسماء الأحياء/الشوارع فوق الصورة الجوية (طبقة مرجعية شفافة)
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    });
    sat.addTo(map);
    labels.addTo(map);
    L.control.layers(
      { 'قمر صناعي': sat, خريطة: streets },
      { 'أسماء وحدود': labels },
      { position: 'topright', collapsed: false },
    ).addTo(map);

    const icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#059669;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);transform:rotate(-45deg)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
    L.marker([lat, lng], { icon }).addTo(map);

    // بطاقة رقم المخطط/القطعة على الخريطة
    if (plot || plan) {
      const badge = new L.Control({ position: 'bottomleft' });
      badge.onAdd = () => {
        const d = L.DomUtil.create('div');
        d.style.cssText = 'background:#fff;padding:5px 9px;border-radius:8px;font:800 12px system-ui,sans-serif;color:#065f46;box-shadow:0 1px 5px rgba(0,0,0,.35)';
        d.setAttribute('dir', 'rtl');
        d.innerHTML = [plan ? `مخطط: <span dir="ltr">${plan}</span>` : '', plot ? `قطعة: <span dir="ltr">${plot}</span>` : ''].filter(Boolean).join(' · ');
        return d;
      };
      badge.addTo(map);
    }

    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 600);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // نُهيّئ مرّة واحدة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={boxRef} style={{ height, width: '100%' }} className="relative z-0 rounded-xl border border-primary/20" />;
}

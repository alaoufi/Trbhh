'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = {
  id: number;
  title: string;
  price: number;
  lat: number;
  lng: number;
  type?: string | null;
  purpose?: 'rent' | 'sale' | 'som' | null;
};

/**
 * خريطة تصفّح العقارات (المنصّة العقارية) — تعرض كل الإعلانات التي لها موقع كدبابيس على خريطة
 * بمبدّل طبقات «قمر صناعي / خريطة». كل دبّوس يحمل السعر، والنقر عليه يفتح العقار. صور الأقمار
 * الجوية (Esri) مجانية بلا مفتاح وتُظهر الأرض/القطعة على الطبيعة. يُحمَّل في المتصفح فقط.
 */
export function ListingsMap({ points, height = 520 }: { points: MapPoint[]; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { center: [24.7136, 46.6753], zoom: 6 });

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'صور الأقمار © Esri',
    });
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    });
    sat.addTo(map);
    labels.addTo(map);
    L.control.layers({ 'قمر صناعي': sat, خريطة: streets }, { 'أسماء وحدود': labels }, { position: 'topright', collapsed: true }).addTo(map);

    const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
    const pins: L.LatLng[] = [];
    for (const p of points) {
      const label = p.price > 0 ? `${fmt(p.price)}` : 'سوم';
      const color = p.purpose === 'rent' ? '#0284c7' : p.purpose === 'sale' ? '#059669' : '#d97706';
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;font:800 11px system-ui,sans-serif;padding:3px 7px;border-radius:11px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap">${label}</div>`,
        iconSize: [1, 1],
        iconAnchor: [20, 24],
      });
      const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
      const priceTxt = p.price > 0 ? `${p.price.toLocaleString('en')} ر.س` : 'على السوم';
      m.bindPopup(
        `<div dir="rtl" style="font:600 13px system-ui,sans-serif;min-width:150px">
           ${p.type ? `<div style="color:#059669;font-weight:800">${p.type}</div>` : ''}
           <div style="margin:2px 0">${p.title.replace(/</g, '&lt;')}</div>
           <div style="font-weight:800;color:#111">${priceTxt}</div>
           <a href="/ads/${p.id}" style="color:#059669;font-weight:800;text-decoration:underline">فتح العقار ←</a>
         </div>`,
      );
      pins.push(L.latLng(p.lat, p.lng));
    }
    if (pins.length) {
      map.fitBounds(L.latLngBounds(pins).pad(0.2), { maxZoom: 15 });
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

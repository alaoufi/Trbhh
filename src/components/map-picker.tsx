'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/**
 * منتقي الموقع على خريطة OpenStreetMap (مجاني، بلا مفاتيح). النقر على الخريطة أو سحب
 * الدبّوس يحدّد الإحداثيات (lat/lng) ويعيدها عبر onChange. يُحمَّل Leaflet ديناميكياً
 * داخل useEffect (يتطلّب window) فلا يُصيَّر على الخادم. دبّوس بأيقونة CSS (بلا صور خارجية).
 */
export function MapPicker({
  lat,
  lng,
  onChange,
  height = 300,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // نحتفظ بأحدث onChange دون إعادة تهيئة الخريطة
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  // مرجع الخريطة والدبّوس لتحديثهما عند تغيّر القيمة من الخارج (GPS/لصق رابط)
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !boxRef.current || mapRef.current) return;
      // الرياض افتراضياً حين لا يوجد موقع محدّد
      const start: [number, number] = [lat ?? 24.7136, lng ?? 46.6753];
      const map = L.map(boxRef.current, { center: start, zoom: lat && lng ? 15 : 6 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#059669;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const marker = L.marker(start, { draggable: true, icon }).addTo(map);
      const emit = (la: number, ln: number) => cbRef.current(Number(la.toFixed(6)), Number(ln.toFixed(6)));
      marker.on('dragend', () => { const p = marker.getLatLng(); emit(p.lat, p.lng); });
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => { marker.setLatLng(e.latlng); emit(e.latlng.lat, e.latlng.lng); });
      mapRef.current = map;
      markerRef.current = marker;
      // إصلاح مقاس الخريطة بعد أول رسم (داخل حاويات مرنة)
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => { disposed = true; };
    // نُهيّئ مرّة واحدة فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحديث موضع الدبّوس/الخريطة عند تغيّر القيمة من مصدر خارجي (زر «موقعي» أو لصق رابط)
  useEffect(() => {
    if (lat == null || lng == null || !markerRef.current || !mapRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15));
  }, [lat, lng]);

  return <div ref={boxRef} style={{ height, width: '100%' }} className="rounded-xl border border-primary/30 z-0" />;
}

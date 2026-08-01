'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * منتقي الموقع على خريطة OpenStreetMap (مجاني، بلا مفاتيح). النقر على الخريطة أو سحب
 * الدبّوس يحدّد الإحداثيات (lat/lng) ويعيدها عبر onChange. يُحمَّل هذا المكوّن في المتصفح
 * فقط (dynamic ssr:false في نموذج الإضافة) لأن Leaflet يتطلّب window. دبّوس بأيقونة CSS
 * (بلا صور خارجية) تفادياً لمشكلة أيقونات Leaflet الافتراضية مع الحُزَم.
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
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const start: [number, number] = [lat ?? 24.7136, lng ?? 46.6753]; // الرياض افتراضياً
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
    map.on('click', (e: L.LeafletMouseEvent) => { marker.setLatLng(e.latlng); emit(e.latlng.lat, e.latlng.lng); });
    mapRef.current = map;
    markerRef.current = marker;
    // إصلاح مقاس الخريطة بعد أول رسم (داخل حاويات مرنة)
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 600);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // نُهيّئ مرّة واحدة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحديث موضع الدبّوس/الخريطة عند تغيّر القيمة من مصدر خارجي (زر «موقعي» أو لصق رابط)
  useEffect(() => {
    if (lat == null || lng == null || !markerRef.current || !mapRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15));
  }, [lat, lng]);

  return <div ref={boxRef} style={{ height, width: '100%' }} className="relative z-0 rounded-xl border border-primary/30" />;
}

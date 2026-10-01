export type BrowserCoordinates = { lat: string; lng: string };

export class BrowserGeolocationError extends Error {
  constructor(public readonly code: number) {
    super(geolocationErrorMessage(code));
    this.name = 'BrowserGeolocationError';
  }
}

export function geolocationErrorMessage(code: number): string {
  if (code === 1) return 'لم تسمح بمشاركة الموقع. يمكنك متابعة استخدام الموقع بدون تحديده.';
  if (code === 3) return 'انتهت مهلة تحديد الموقع. يمكنك المتابعة بدون تحديده.';
  return 'تعذر تحديد موقعك. يمكنك متابعة استخدام الموقع بدون تحديد الموقع.';
}

/** Invoked only by an explicit user action or an already-enabled location feature. */
export function requestCurrentCoordinates(geolocation: Geolocation): Promise<BrowserCoordinates> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude.toFixed(6),
        lng: position.coords.longitude.toFixed(6),
      }),
      (error) => reject(new BrowserGeolocationError(error.code)),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

export const VISITOR_LOCATION_SESSION_KEY = 'trbhh_visitor_location';

export function readSessionCoordinates(storage: Pick<Storage, 'getItem'>): BrowserCoordinates | null {
  try {
    const value = storage.getItem(VISITOR_LOCATION_SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<BrowserCoordinates>;
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
  } catch {
    return null;
  }
}

export function saveSessionCoordinates(storage: Pick<Storage, 'setItem'>, coordinates: BrowserCoordinates): void {
  storage.setItem(VISITOR_LOCATION_SESSION_KEY, JSON.stringify(coordinates));
}

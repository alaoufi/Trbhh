import { describe, expect, it, vi } from 'vitest';
import { geolocationErrorMessage, requestCurrentCoordinates } from '@/lib/geolocation-client';

describe('explicit browser geolocation', () => {
  it('does not call the browser until the request function is invoked', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 24.71361234, longitude: 46.67531234 } } as GeolocationPosition));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await expect(requestCurrentCoordinates({ getCurrentPosition } as unknown as Geolocation)).resolves.toEqual({ lat: '24.713612', lng: '46.675312' });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('uses concise Arabic messages for browser failures', () => {
    expect(geolocationErrorMessage(1)).toContain('لم تسمح');
    expect(geolocationErrorMessage(2)).toContain('تعذر تحديد موقعك');
    expect(geolocationErrorMessage(3)).toContain('مهلة');
  });
});

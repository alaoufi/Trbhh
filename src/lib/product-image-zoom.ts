export type ImageRect = { left: number; top: number; width: number; height: number };
export type ZoomTransform = { scale: number; x: number; y: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function containedImageRect(rect: ImageRect, naturalWidth: number, naturalHeight: number): ImageRect | null {
  if (naturalWidth <= 0 || naturalHeight <= 0 || rect.width <= 0 || rect.height <= 0) return null;
  const ratio = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
  const width = naturalWidth * ratio;
  const height = naturalHeight * ratio;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

export function zoomPanelRect(rect: ImageRect, viewportWidth: number, viewportHeight: number): ImageRect {
  const width = Math.max(1, Math.min(360, viewportWidth - 24));
  const height = Math.max(1, Math.min(360, viewportHeight - 24));
  const right = rect.left + rect.width + 16;
  const left = right + width <= viewportWidth - 12 ? right : rect.left - 16 - width >= 12 ? rect.left - 16 - width : viewportWidth - width - 12;
  return { left, top: clamp(rect.top, 12, Math.max(12, viewportHeight - height - 12)), width, height };
}

export function lensPosition(rect: ImageRect, x: number, y: number, width: number, height: number) {
  const w = Math.min(width, rect.width), h = Math.min(height, rect.height);
  const left = clamp(x - w / 2, rect.left, rect.left + rect.width - w);
  const top = clamp(y - h / 2, rect.top, rect.top + rect.height - h);
  return { left, top, centerX: left + w / 2, centerY: top + h / 2 };
}

export function constrainTransform(transform: ZoomTransform, width: number, height: number): ZoomTransform {
  const scale = clamp(transform.scale, 1, 4);
  return { scale, x: clamp(transform.x, -width * (scale - 1) / 2, width * (scale - 1) / 2), y: clamp(transform.y, -height * (scale - 1) / 2, height * (scale - 1) / 2) };
}

export function pinchTransform(start: ZoomTransform, anchor: { x: number; y: number }, midpoint: { x: number; y: number }, ratio: number, width: number, height: number): ZoomTransform {
  const scale = clamp(start.scale * ratio, 1, 4);
  const factor = scale / start.scale;
  return constrainTransform({ scale, x: midpoint.x - (anchor.x - start.x) * factor, y: midpoint.y - (anchor.y - start.y) * factor }, width, height);
}

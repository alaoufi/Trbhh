'use client';

/**
 * Shrink an image in the browser before upload so it transfers fast even on
 * very slow connections. Animated GIFs are left untouched (canvas would flatten
 * them). Returns the original file if compression fails or doesn't help.
 */
export async function compressImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // no gain
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Compress the file(s) chosen in a file <input> and write the smaller version(s)
 * back into the input so the form submits the compressed payload. Returns the
 * first (compressed) file for preview, or null.
 */
export async function compressInputFiles(input: HTMLInputElement, maxDim = 1600): Promise<File | null> {
  const files = input.files ? Array.from(input.files) : [];
  if (!files.length) return null;
  const out = await Promise.all(files.map((f) => compressImageFile(f, maxDim)));
  try {
    const dt = new DataTransfer();
    out.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  } catch {
    /* DataTransfer unsupported → submit originals */
  }
  return out[0] ?? null;
}

'use client';
import { useState, useCallback, useRef } from 'react';
import { X, GripVertical, Upload } from 'lucide-react';

interface ImagePreview {
  file: File;
  preview: string;
  id: string;
}

/**
 * Downscale + re-encode a photo to JPEG in the browser before upload. Two wins:
 *  1) shrinks the payload so a multi-photo ad no longer blows past the request
 *     body limit (which silently killed the whole "publish" POST).
 *  2) normalizes HEIC/HEIF (iPhone) to JPEG so images always render.
 * Fully defensive: returns the ORIGINAL file on any failure (e.g. a browser that
 * can't decode HEIC) and lets the server handle it.
 */
async function compressImage(file: File): Promise<File> {
  try {
    if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file;
    const MAX = 1920;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      return file; // undecodable here (e.g. HEIC on some Android browsers) → server converts it
    }
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) return file;
    // Don't swap if nothing was gained (small image that didn't need resizing).
    if (scale === 1 && blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function ImageUploader({
  onImagesChange,
  onBusyChange,
  name = 'images',
  maxImages = 10,
  initialImages = []
}: {
  onImagesChange: (files: File[]) => void;
  onBusyChange?: (busy: boolean) => void;
  name?: string;
  maxImages?: number;
  initialImages?: string[];
}) {
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // Ref mirrors state so async compression callbacks always commit against the
  // latest list without stale closures.
  const imagesRef = useRef<ImagePreview[]>([]);
  // A REAL hidden <input name="images"> whose FileList we keep in sync — this is
  // what the form actually submits. Without it the picker is preview-only and no
  // image ever reaches the server (formData.getAll('images') would be empty).
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(0);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const commit = useCallback((next: ImagePreview[]) => {
    imagesRef.current = next;
    setImages(next);
    // sync the submittable file field (originals now, compressed versions once ready)
    const el = hiddenInputRef.current;
    if (el) {
      try {
        const dt = new DataTransfer();
        next.forEach((i) => dt.items.add(i.file));
        el.files = dt.files;
      } catch { /* DataTransfer unsupported on a very old browser → leave as-is */ }
    }
    onImagesChange(next.map(img => img.file));
  }, [onImagesChange]);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const remainingSlots = maxImages - imagesRef.current.length;
    const additions: ImagePreview[] = [];
    Array.from(files).slice(0, remainingSlots).forEach(file => {
      // Accept by MIME or by extension — some pickers report an empty type for HEIC.
      const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(file.name);
      if (isImg) {
        additions.push({ file, preview: URL.createObjectURL(file), id: generateId() });
      }
    });
    if (!additions.length) return;

    // Show previews immediately (from the originals) for instant feedback, and
    // sync them into the submittable field right away — so even if the member
    // submits before compression finishes, the originals are sent (and the
    // server downscales/normalizes them) rather than nothing.
    commit([...imagesRef.current, ...additions].slice(0, maxImages));

    // …then compress each in the background and swap the smaller file in place.
    additions.forEach((item) => {
      pendingRef.current += 1;
      onBusyChange?.(true);
      compressImage(item.file).then((out) => {
        if (out !== item.file) {
          const cur = imagesRef.current;
          if (cur.some((i) => i.id === item.id)) {
            commit(cur.map((i) => (i.id === item.id ? { ...i, file: out } : i)));
          }
        }
      }).finally(() => {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) onBusyChange?.(false);
      });
    });
  }, [maxImages, commit, onBusyChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const removeImage = (id: string) => {
    commit(images.filter(img => img.id !== id));
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    const updated = [...images];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    commit(updated);
  };

  return (
    <div className="space-y-3">
      {/* The actual submitted field — kept in sync with the selected/compressed
          files so the form uploads them (hidden inputs still submit their files). */}
      <input ref={hiddenInputRef} type="file" name={name} multiple accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true" />
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver 
            ? 'border-primary bg-primary/10' 
            : 'border-primary/25 bg-white hover:border-primary/50'
        }`}
      >
        <Upload className="mx-auto h-8 w-8 text-primary/60" />
        <p className="mt-2 text-sm font-medium text-foreground/70">
          اسحب الصور هنا أو <span className="text-primary">انقر للاختيار</span>
        </p>
        <p className="text-xs text-muted-foreground">
          حتى {maxImages} صور — {images.length} / {maxImages}
        </p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => processFiles(e.target.files)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>

      {/* Image Previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((img, index) => (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                moveImage(fromIndex, index);
              }}
              className="group relative aspect-square overflow-hidden rounded-lg border-2 border-primary/20 bg-gray-100"
            >
              <img
                src={img.preview}
                alt={`صورة ${index + 1}`}
                className="h-full w-full object-cover"
              />

              {/* Controls */}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Order indicator */}
              <div className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {index + 1}
              </div>

              {/* Drag handle */}
              <div className="absolute right-1 top-1 cursor-move rounded bg-black/50 p-1 text-white">
                <GripVertical className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

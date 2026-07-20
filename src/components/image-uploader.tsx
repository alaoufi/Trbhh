'use client';
import { useState, useCallback } from 'react';
import { X, GripVertical, Upload } from 'lucide-react';

interface ImagePreview {
  file: File;
  preview: string;
  id: string;
}

export function ImageUploader({ 
  onImagesChange, 
  maxImages = 10,
  initialImages = []
}: { 
  onImagesChange: (files: File[]) => void;
  maxImages?: number;
  initialImages?: string[];
}) {
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const newImages: ImagePreview[] = [];
    const remainingSlots = maxImages - images.length;

    Array.from(files).slice(0, remainingSlots).forEach(file => {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file);
        newImages.push({ file, preview, id: generateId() });
      }
    });

    const updated = [...images, ...newImages].slice(0, maxImages);
    setImages(updated);
    onImagesChange(updated.map(img => img.file));
  }, [images, maxImages, onImagesChange]);

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
    const updated = images.filter(img => img.id !== id);
    setImages(updated);
    onImagesChange(updated.map(img => img.file));
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    const updated = [...images];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setImages(updated);
    onImagesChange(updated.map(img => img.file));
  };

  return (
    <div className="space-y-3">
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

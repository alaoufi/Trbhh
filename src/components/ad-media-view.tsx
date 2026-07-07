import { mediaUrl } from '@/lib/media';

/** فيديو/صوت الإعلان — مكوّن مشترك بين صفحة إعلان تربح وصفحة إعلان المتجر. */
export function AdMedia({ videoPath, audioPath }: { videoPath: string | null; audioPath: string | null }) {
  if (!videoPath && !audioPath) return null;
  return (
    <div className="space-y-3">
      {videoPath && (
        <div className="card-3d overflow-hidden rounded-2xl p-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-sm font-bold text-primary">🎬 فيديو الإعلان</div>
          <video src={mediaUrl(videoPath)} controls playsInline preload="metadata" className="max-h-[70vh] w-full rounded-xl bg-black" />
        </div>
      )}
      {audioPath && (
        <div className="card-3d flex items-center gap-3 rounded-2xl p-3">
          <span className="text-sm font-bold text-primary">🎙️ تسجيل صوتي</span>
          <audio src={mediaUrl(audioPath)} controls className="h-9 flex-1" />
        </div>
      )}
    </div>
  );
}

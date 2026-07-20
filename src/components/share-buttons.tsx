'use client';
import { Share2, Copy, MessageCircle, Twitter, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const shareData = {
    title,
    text: `شاهد هذا الإعلان على تربح: ${title}`,
    url,
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    // Could show toast here
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`${shareData.text}
${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(shareData.text);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const handleFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-muted-foreground">مشاركة:</span>

      {navigator.share && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleNativeShare}
          className="gap-1.5 text-xs"
        >
          <Share2 className="h-3.5 w-3.5" />
          مشاركة
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="gap-1.5 text-xs"
      >
        <Copy className="h-3.5 w-3.5" />
        نسخ
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleWhatsApp}
        className="gap-1.5 text-xs bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        واتساب
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleTwitter}
        className="gap-1.5 text-xs bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
      >
        <Twitter className="h-3.5 w-3.5" />
        تويتر
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleFacebook}
        className="gap-1.5 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
      >
        <Facebook className="h-3.5 w-3.5" />
        فيسبوك
      </Button>
    </div>
  );
}

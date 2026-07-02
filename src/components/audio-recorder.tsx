'use client';
import { useRef, useState } from 'react';
import { Mic, Square, Trash2, Play } from 'lucide-react';

/** Record a short voice note from the mic and attach it to the form as `name`. */
export function AudioRecorder({ name = 'audio' }: { name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');

  async function start() {
    setErr('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setErr('التسجيل غير مدعوم في هذا المتصفح'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const file = new File([blob], 'voice.webm', { type: blob.type });
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          if (inputRef.current) inputRef.current.files = dt.files;
        } catch { /* ignore */ }
        setUrl(URL.createObjectURL(blob));
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => (s >= 120 ? (stop(), s) : s + 1)), 1000);
    } catch {
      setErr('تعذّر الوصول إلى الميكروفون. تأكد من منح الإذن.');
    }
  }
  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
    setRecording(false);
  }
  function remove() {
    setUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" name={name} accept="audio/*" hidden />
      {!url ? (
        <div className="flex items-center gap-2">
          {!recording ? (
            <button type="button" onClick={start} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white">
              <Mic className="h-4 w-4" /> ابدأ التسجيل
            </button>
          ) : (
            <button type="button" onClick={stop} className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white">
              <Square className="h-4 w-4" /> إيقاف ({secs}ث)
            </button>
          )}
          {recording && <span className="flex items-center gap-1 text-sm text-red-600"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> يسجّل…</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <audio src={url} controls className="h-9 flex-1" />
          <button type="button" onClick={remove} className="rounded-lg border border-destructive/30 p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

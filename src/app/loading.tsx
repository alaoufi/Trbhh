/** Visible fallback while a server-rendered route is being prepared. */
export default function Loading() {
  return (
    <div className="grid min-h-[34vh] place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl border bg-white px-5 py-4 text-sm font-bold text-primary shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        جارٍ تحميل الصفحة…
      </div>
    </div>
  );
}

/** The provider seal keeps its official embedding attributes inside a reserved footer slot. */
export function VerifySeal({ className = '' }: { className?: string }) {
  return <div data-verify-seal-slot className="container min-h-20 py-3">
    <div className={`sbc-verify-seal ${className}`.trim()} data-token="dklvcSt3ZUxBNGwrRlQ5TTN4SjBxdz09" data-position="bottom-left" />
  </div>;
}

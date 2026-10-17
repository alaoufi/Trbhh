/** Limit bytes while reading, before authentication or JSON parsing allocates the body. */
export class WebhookBodyTooLarge extends Error {
  constructor() { super('webhook_body_too_large'); }
}
export async function readCjWebhookBody(
  req: {body: ReadableStream<Uint8Array> | null; headers: Headers},
  maxBytes: number,
): Promise<Buffer> {
  const declared = req.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await req.body?.cancel().catch(() => {});
    throw new WebhookBodyTooLarge();
  }
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  // A fixed buffer also bounds overhead when a sender uses many tiny chunks.
  const bytes = Buffer.allocUnsafe(maxBytes);
  let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - total) {
        await reader.cancel().catch(() => {});
        throw new WebhookBodyTooLarge();
      }
      if (value.byteLength) { bytes.set(value, total); total += value.byteLength; }
    }
    return bytes.subarray(0, total);
  } finally { reader.releaseLock(); }
}

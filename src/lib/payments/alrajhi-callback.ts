/** Read an ARB callback exactly once; Bank Hosted returns form data after OTP. */
export async function readAlrajhiCallbackBody(req: Request): Promise<Record<string, string> | null> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return Object.fromEntries(Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
  }

  const form = await req.formData();
  return Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

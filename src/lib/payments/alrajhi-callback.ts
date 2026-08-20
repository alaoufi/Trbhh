/** Read an ARB callback exactly once; Bank Hosted returns form data after OTP. */
export async function readAlrajhiCallbackBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return req.json();
  }

  const form = await req.formData();
  return Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

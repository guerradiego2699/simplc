/** Small helpers shared by the lab's Vercel functions. */

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Reads a JSON object body; `null` when it is missing, not JSON or not an object. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.includes('application/json')) return null;
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Cookies get the Secure flag everywhere except plain-http local development. */
export const isSecure = (request: Request): boolean => new URL(request.url).protocol === 'https:';

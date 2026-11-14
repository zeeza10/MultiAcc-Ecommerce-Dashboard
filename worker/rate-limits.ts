import type { RateLimitBinding } from './types';

const response = (body: unknown, status: number, retryAfter?: number) => {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (retryAfter) headers.set('Retry-After', String(retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
};

/**
 * Enforces an authenticated per-user limit. Cloudflare's native binding is
 * approximate and scoped to each Cloudflare location, not globally strict.
 */
export async function enforceRateLimit(
  binding: RateLimitBinding,
  userId: string,
  label: string,
): Promise<Response | null> {
  try {
    const { success } = await binding.limit({ key: userId });
    if (success) return null;
    return response({ error: `Too many ${label.toLowerCase()}s. Please wait before trying again.` }, 429, 60);
  } catch {
    // Fail closed if the protection binding is unavailable.
    return response({ error: 'Request protection is temporarily unavailable. Please retry shortly.' }, 503, 30);
  }
}

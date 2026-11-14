const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const MAX_API_REQUEST_BODY_BYTES = 1_048_576;

/**
 * Enforces a bounded request body for API write methods.
 * Checks Content-Length when present and also counts streamed bytes so
 * chunked/unknown-length requests cannot bypass the limit.
 */
export async function exceedsApiRequestBodyLimit(request: Request): Promise<boolean> {
  if (!BODY_METHODS.has(request.method.toUpperCase()) || !request.body) return false;

  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return true;
    if (Number(declaredLength) > MAX_API_REQUEST_BODY_BYTES) return true;
  }

  const body = request.clone().body;
  if (!body) return false;

  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      total += value.byteLength;
      if (total > MAX_API_REQUEST_BODY_BYTES) {
        await reader.cancel('Request body exceeds the configured limit').catch(() => undefined);
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

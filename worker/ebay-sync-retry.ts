export type EbaySyncFailure = {
  httpStatus?: number | null;
  providerCode?: string | null;
};

/**
 * Classifies failures that should not be retried without changing the request
 * or seller authorization. Provider code 30830 means the requested order
 * date range is outside eBay's supported window; repeating the same request
 * cannot succeed.
 */
export function isRetryableEbaySyncFailure(failure: EbaySyncFailure): boolean {
  const providerCode = String(failure.providerCode || '').trim();
  if (providerCode === '30830') return false;

  const status = Number(failure.httpStatus);
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (status >= 400 && status <= 499) return false;

  // Network errors and unclassified transient failures remain retryable.
  return true;
}

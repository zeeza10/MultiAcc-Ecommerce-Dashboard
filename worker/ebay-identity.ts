import type { EbayEnvironment } from './ebay-security';

export type EbaySellerIdentity = {
  userId: string;
  username: string | null;
};

function identityBaseUrl(environment: EbayEnvironment): string {
  return environment === 'SANDBOX'
    ? 'https://apiz.sandbox.ebay.com'
    : 'https://apiz.ebay.com';
}

/**
 * Retrieves the authenticated seller identity using the OAuth user access token.
 * Only the public immutable user ID and mutable username are returned to callers.
 */
export async function fetchEbaySellerIdentity(
  environment: EbayEnvironment,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EbaySellerIdentity> {
  if (!accessToken || accessToken.length > 8192) {
    throw new Error('A valid eBay user access token is required for identity verification.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(
      `${identityBaseUrl(environment)}/commerce/identity/v1/user/`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error('eBay seller identity could not be verified. Reconnect the seller account and retry.');
    }

    const body = await response.json() as { userId?: unknown; username?: unknown };
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId || userId.length > 256) {
      throw new Error('eBay returned an invalid seller identity. The account was not connected.');
    }

    const username = typeof body.username === 'string' && body.username.trim()
      ? body.username.trim().slice(0, 256)
      : null;

    return { userId, username };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('eBay ')) throw error;
    throw new Error('eBay seller identity verification is temporarily unavailable. Reconnect the seller account and retry.');
  } finally {
    clearTimeout(timeout);
  }
}

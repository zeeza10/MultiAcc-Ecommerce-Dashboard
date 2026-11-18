/**
 * eBay Marketplace Account Deletion endpoint verification.
 *
 * eBay requires GET challenge verification before it accepts this endpoint.
 * POST processing is deliberately fail-closed until signed-notification
 * verification and durable deletion workflow are implemented.
 */
import type { WorkerEnv } from './types';

export const EBAY_ACCOUNT_DELETION_ENDPOINT =
  'https://app.oriafuture.com/api/v1/ebay/account-deletion-notification';

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function handleEbayAccountDeletionNotification(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/v1/ebay/account-deletion-notification') return null;

  if (request.method === 'GET') {
    const challengeCode = url.searchParams.get('challenge_code');
    const verificationToken = env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;

    if (!challengeCode || challengeCode.length > 256) {
      return json({ error: 'A valid eBay challenge_code is required.' }, 400);
    }
    if (!verificationToken || !/^[A-Za-z0-9_-]{32,80}$/.test(verificationToken)) {
      return json({ error: 'The eBay notification verification token is not configured correctly.' }, 503);
    }

    const bytes = new TextEncoder().encode(
      challengeCode + verificationToken + EBAY_ACCOUNT_DELETION_ENDPOINT,
    );
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const challengeResponse = Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');

    return json({ challengeResponse });
  }

  if (request.method === 'POST') {
    // Do not acknowledge deletion events until signature verification,
    // durable event storage, and the account-data deletion processor are live.
    return json({
      error: 'eBay notification processing is not enabled yet.',
      code: 'EBAY_DELETION_PROCESSOR_NOT_READY',
    }, 503);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' },
  });
}

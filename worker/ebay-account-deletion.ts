/**
 * eBay Marketplace Account Deletion endpoint.
 * GET validates endpoint ownership; POST verifies eBay's ECC signature and
 * durably queues an encrypted notification for a separately audited deletion workflow.
 */
import { verify as verifySignature } from 'node:crypto';
import {
  createServiceClient, encryptEbayValue, getPlatformCredentials, ebayBaseUrl,
  type EbayEnvironment,
} from './ebay-security';
import type { WorkerEnv } from './types';

export const EBAY_ACCOUNT_DELETION_ENDPOINT =
  'https://app.oriafuture.com/api/v1/ebay/account-deletion-notification';

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

type EbaySignatureHeader = {
  alg: string;
  kid: string;
  signature: string;
  digest: 'SHA1' | 'SHA256';
};
type DeletionNotification = {
  metadata?: { topic?: string; schemaVersion?: string };
  notification?: {
    notificationId?: string;
    data?: { userId?: string; username?: string; eiasToken?: string };
  };
};

function parseSignatureHeader(value: string): EbaySignatureHeader | null {
  if (!value || value.length > 8192) return null;
  try {
    const parsed = JSON.parse(atob(value)) as Record<string, unknown>;
    if (parsed.alg !== 'ecdsa' ||
        (parsed.digest !== 'SHA1' && parsed.digest !== 'SHA256') ||
        typeof parsed.kid !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(parsed.kid) ||
        typeof parsed.signature !== 'string' || parsed.signature.length > 2048) return null;
    return parsed as unknown as EbaySignatureHeader;
  } catch {
    return null;
  }
}

/**
 * Verify the exact JSON payload using the digest declared by eBay.
 * eBay's notification SDK uses ssl3-sha1 (the SHA-1 signature digest);
 * SHA-256 is also accepted for compatible notification headers.
 */
export function verifyEbayNotificationSignature(
  rawPayload: string,
  signature: string,
  publicKeyPem: string,
  digest: EbaySignatureHeader['digest'] = 'SHA1',
): boolean {
  if (!publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----') ||
      !publicKeyPem.includes('-----END PUBLIC KEY-----')) return false;
  try {
    const algorithm = digest === 'SHA1' ? 'sha1' : 'sha256';
    return verifySignature(
      algorithm,
      Buffer.from(rawPayload, 'utf8'),
      publicKeyPem,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

const publicKeyCache = new Map<string, { key: string; expiresAt: number }>();

async function fetchEbayPublicKey(
  environment: EbayEnvironment,
  keyId: string,
  env: WorkerEnv,
): Promise<string | null> {
  const cacheKey = environment + ':' + keyId;
  const cached = publicKeyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const credentials = await getPlatformCredentials(env, environment);
  if (!credentials) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const tokenResponse = await fetch(`${ebayBaseUrl(environment)}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }),
      signal: controller.signal,
    });
    if (!tokenResponse.ok) return null;
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) return null;

    const keyResponse = await fetch(
      `${ebayBaseUrl(environment)}/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`,
      { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' }, signal: controller.signal },
    );
    if (!keyResponse.ok) return null;
    const keyData = await keyResponse.json() as { key?: string };
    if (typeof keyData.key !== 'string' || !keyData.key.includes('-----BEGIN PUBLIC KEY-----')) return null;
    if (publicKeyCache.size >= 100) {
      const oldestKey = publicKeyCache.keys().next().value;
      if (oldestKey) publicKeyCache.delete(oldestKey);
    }
    publicKeyCache.set(cacheKey, { key: keyData.key, expiresAt: Date.now() + 60 * 60 * 1000 });
    return keyData.key;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyWithConfiguredEnvironments(
  rawPayload: string,
  header: EbaySignatureHeader,
  env: WorkerEnv,
): Promise<boolean> {
  // The same callback can be registered against Sandbox and Production keysets.
  for (const environment of ['PRODUCTION', 'SANDBOX'] as const) {
    try {
      const key = await fetchEbayPublicKey(environment, header.kid, env);
      if (key && verifyEbayNotificationSignature(rawPayload, header.signature, key, header.digest)) return true;
    } catch {
      // Continue to the other environment without leaking provider details.
    }
  }
  return false;
}

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
    const signatureHeader = parseSignatureHeader(request.headers.get('X-EBAY-SIGNATURE') || '');
    if (!signatureHeader) return json({ error: 'The eBay notification signature is missing or malformed.' }, 412);

    const rawBody = await request.text();
    if (!rawBody || rawBody.length > 65536) return json({ error: 'The notification payload is invalid.' }, 400);
    let payload: DeletionNotification;
    try {
      payload = JSON.parse(rawBody) as DeletionNotification;
    } catch {
      return json({ error: 'The notification payload is not valid JSON.' }, 400);
    }
    const notification = payload.notification;
    const notificationId = notification?.notificationId;
    if (payload.metadata?.topic !== 'MARKETPLACE_ACCOUNT_DELETION' ||
        typeof notificationId !== 'string' || notificationId.length > 256 ||
        typeof notification?.data?.userId !== 'string' ||
        typeof notification?.data?.eiasToken !== 'string') {
      return json({ error: 'The notification payload does not match the account-deletion schema.' }, 400);
    }

    if (!await verifyWithConfiguredEnvironments(rawBody, signatureHeader, env)) {
      return json({ error: 'The eBay notification signature could not be verified.' }, 412);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.EBAY_TOKEN_ENCRYPTION_KEY) {
      return json({ error: 'The secure notification store is not configured.' }, 503);
    }

    try {
      // Keep the complete provider payload encrypted at rest; never log or expose eIAS tokens.
      const encryptedPayload = await encryptEbayValue(JSON.stringify(payload), env);
      const admin = createServiceClient(env);
      const { error } = await admin.from('ebay_account_deletion_events').upsert({
        notification_id: notificationId,
        public_key_id: signatureHeader.kid,
        encrypted_payload: encryptedPayload,
        processing_status: 'PENDING',
        received_at: new Date().toISOString(),
      }, { onConflict: 'notification_id', ignoreDuplicates: true });
      if (error) return json({ error: 'The verified notification could not be durably queued.' }, 503);
      // Acknowledge only after verified, encrypted, idempotent persistence.
      // Actual account-data erasure remains a separately controlled workflow.
      return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return json({ error: 'The verified notification could not be durably queued.' }, 503);
    }
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' },
  });
}

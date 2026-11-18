import { createClient } from '@supabase/supabase-js';
import type { WorkerEnv } from './types';

export type EbayEnvironment = 'SANDBOX' | 'PRODUCTION';
export type EbayPlatformCredentials = { clientId: string; clientSecret: string; ruName: string; credentialVersion: number };

export function createServiceClient(env: WorkerEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Server-side Supabase integration is not configured.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(env: WorkerEnv): Promise<CryptoKey> {
  const encoded = env.EBAY_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error('eBay token encryption is not configured.');
  const raw = decodeBase64(encoded);
  if (raw.byteLength !== 32) throw new Error('eBay encryption key must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptEbayValue(value: string, env: WorkerEnv): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, await encryptionKey(env), new TextEncoder().encode(value));
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`;
}

export async function decryptEbayValue(value: string, env: WorkerEnv): Promise<string> {
  const [version, ivPart, ciphertextPart] = value.split('.');
  if (version !== 'v1' || !ivPart || !ciphertextPart) throw new Error('Unsupported encrypted eBay credential format.');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(decodeBase64(ivPart)) },
    await encryptionKey(env),
    toArrayBuffer(decodeBase64(ciphertextPart)),
  );
  return new TextDecoder().decode(decrypted);
}

export async function hashEbayState(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function ebayBaseUrl(environment: EbayEnvironment): string {
  return environment === 'SANDBOX' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

export function ebayAuthUrl(environment: EbayEnvironment): string {
  return environment === 'SANDBOX' ? 'https://auth.sandbox.ebay.com/oauth2/authorize' : 'https://auth.ebay.com/oauth2/authorize';
}


export class EbayCredentialVerificationError extends Error {
  constructor(
    message: string,
    readonly code: 'EBAY_CREDENTIALS_REJECTED' | 'EBAY_VERIFICATION_UNAVAILABLE' | 'EBAY_INVALID_TOKEN_RESPONSE',
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'EbayCredentialVerificationError';
  }
}

/**
 * Verifies the application keypair against the selected eBay environment.
 * The short-lived application token is intentionally discarded and never logged or persisted.
 */
export async function verifyEbayApplicationCredentials(
  environment: EbayEnvironment,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    });
    let response: Response;
    try {
      response = await fetchImpl(`${ebayBaseUrl(environment)}/identity/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw new EbayCredentialVerificationError(
        'eBay credential verification is temporarily unavailable. No credentials were saved; please retry.',
        'EBAY_VERIFICATION_UNAVAILABLE',
        503,
      );
    }

    if (response.status === 400 || response.status === 401 || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
      throw new EbayCredentialVerificationError(
        'eBay did not accept this application keypair for the selected environment. Check the Client ID, Client Secret and Sandbox/Production selection. Nothing was saved.',
        'EBAY_CREDENTIALS_REJECTED',
        422,
      );
    }
    if (!response.ok) {
      throw new EbayCredentialVerificationError(
        'eBay credential verification is temporarily unavailable. No credentials were saved; please retry.',
        'EBAY_VERIFICATION_UNAVAILABLE',
        503,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const token: Record<string, unknown> = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    if (typeof token.access_token !== 'string' || !token.access_token || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
      throw new EbayCredentialVerificationError(
        'eBay returned an unexpected verification response. No credentials were saved.',
        'EBAY_INVALID_TOKEN_RESPONSE',
        502,
      );
    }
    // Deliberately do not return, log, or persist the application access token.
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPlatformCredentials(env: WorkerEnv, environment: EbayEnvironment): Promise<EbayPlatformCredentials | null> {
  const admin = createServiceClient(env);
  const { data, error } = await admin.from('platform_integration_credentials')
    .select('client_id_ciphertext,client_secret_ciphertext,ru_name_ciphertext,credential_version,credentials_verified_at')
    .eq('provider', 'EBAY').eq('environment', environment).maybeSingle();
  if (error) throw new Error('eBay application credentials could not be loaded.');
  if (!data || !data.credentials_verified_at) return null;
  const [clientId, clientSecret, ruName] = await Promise.all([
    decryptEbayValue(data.client_id_ciphertext, env),
    decryptEbayValue(data.client_secret_ciphertext, env),
    decryptEbayValue(data.ru_name_ciphertext, env),
  ]);
  return { clientId, clientSecret, ruName, credentialVersion: data.credential_version };
}

export function sanitizeEbayError(value: unknown): string {
  const message = value instanceof Error ? value.message : 'eBay request failed.';
  return message
    .replaceAll(String.fromCharCode(13), ' ')
    .replaceAll(String.fromCharCode(10), ' ')
    .replaceAll(String.fromCharCode(9), ' ')
    .slice(0, 240);
}

import { createClient } from '@supabase/supabase-js';
import type { WorkerEnv } from './types';

export type EbayEnvironment = 'SANDBOX' | 'PRODUCTION';
export type EbayPlatformCredentials = { clientId: string; clientSecret: string; ruName: string; credentialVersion: number };

export function createServiceClient(env: WorkerEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Server-side Supabase integration is not configured.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
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

export async function getPlatformCredentials(env: WorkerEnv, environment: EbayEnvironment): Promise<EbayPlatformCredentials | null> {
  const admin = createServiceClient(env);
  const { data, error } = await admin.from('platform_integration_credentials')
    .select('client_id_ciphertext,client_secret_ciphertext,ru_name_ciphertext,credential_version')
    .eq('provider', 'EBAY').eq('environment', environment).maybeSingle();
  if (error) throw new Error('eBay application credentials could not be loaded.');
  if (!data) return null;
  const [clientId, clientSecret, ruName] = await Promise.all([
    decryptEbayValue(data.client_id_ciphertext, env),
    decryptEbayValue(data.client_secret_ciphertext, env),
    decryptEbayValue(data.ru_name_ciphertext, env),
  ]);
  return { clientId, clientSecret, ruName, credentialVersion: data.credential_version };
}

export function sanitizeEbayError(value: unknown): string {
  const message = value instanceof Error ? value.message : 'eBay request failed.';
  return message.replace(/[\r
\t]/g, ' ').slice(0, 240);
}

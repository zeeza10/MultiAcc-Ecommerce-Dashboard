import { createServiceClient, decryptEbayValue, encryptEbayValue, getPlatformCredentials } from './ebay-security';
import type { WorkerEnv } from './types';

type SigningKeyRecord = {
  signing_key_id: string;
  private_key_ciphertext: string;
  public_key_jwe: string;
  expires_at: string | null;
};

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function mintEbayApplicationToken(clientId: string, clientSecret: string): Promise<string> {
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: form,
  });
  if (!response.ok) throw new Error('eBay application authorization for signing-key management failed.');
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('eBay did not return an application access token for signing-key management.');
  }
  return payload.access_token;
}

async function loadOrCreateSigningKey(env: WorkerEnv): Promise<SigningKeyRecord> {
    const admin = createServiceClient(env);
  const { data: existing, error } = await admin.from('ebay_application_signing_keys')
    .select('signing_key_id,private_key_ciphertext,public_key_jwe,expires_at')
    .eq('environment', 'PRODUCTION').eq('is_active', true).maybeSingle();
  if (error) throw new Error('The eBay Production signing key could not be loaded.');
  if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now() + 86400000)) {
    return existing as SigningKeyRecord;
  }

  const credentials = await getPlatformCredentials(env, 'PRODUCTION');
  if (!credentials) throw new Error('Verified eBay Production application credentials are required for Finances API signing.');
  const applicationToken = await mintEbayApplicationToken(credentials.clientId, credentials.clientSecret);
  const response = await fetch('https://apiz.ebay.com/developer/key_management/v1/signing_key', {
    method: 'POST',
    headers: { Authorization: `Bearer ${applicationToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ signingKeyCipher: 'ED25519' }),
  });
  if (!response.ok) throw new Error('eBay Key Management API could not create a Production signing key.');
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload.signingKeyId !== 'string' || typeof payload.privateKey !== 'string' || typeof payload.jwe !== 'string') {
    throw new Error('eBay Key Management API returned an incomplete signing-key response.');
  }

  const privateKeyCiphertext = await encryptEbayValue(payload.privateKey, env);
  const expiration = typeof payload.expirationTime === 'number' && Number.isFinite(payload.expirationTime)
    ? new Date(payload.expirationTime * 1000).toISOString()
    : null;
  if (existing) {
    const { error: deactivateError } = await admin.from('ebay_application_signing_keys')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('signing_key_id', existing.signing_key_id);
    if (deactivateError) throw new Error('The previous eBay signing key could not be retired.');
  }
  const { data, error: insertError } = await admin.from('ebay_application_signing_keys')
    .insert({
      environment: 'PRODUCTION',
      signing_key_id: payload.signingKeyId,
      signing_key_cipher: 'ED25519',
      private_key_ciphertext: privateKeyCiphertext,
      public_key_jwe: payload.jwe,
      expires_at: expiration,
      is_active: true,
    })
    .select('signing_key_id,private_key_ciphertext,public_key_jwe,expires_at').single();
  if (insertError || !data) throw new Error('The encrypted eBay Production signing key could not be stored.');
  return data as SigningKeyRecord;
}

export function buildEbaySignatureComponents(method: 'GET', requestUrl: string, jwe: string, created: number): {
  signatureInput: string;
  signatureBase: string;
} {
  const url = new URL(requestUrl);
  const components = '("x-ebay-signature-key" "@method" "@path" "@authority")';
  const signatureInput = `sig1=${components};created=${created}`;
  const signatureBase = [
    `"x-ebay-signature-key": ${jwe}`,
    `"@method": ${method}`,
    `"@path": ${url.pathname}${url.search}`,
    `"@authority": ${url.host}`,
    `"@signature-params": ${components};created=${created}`,
  ].join('\\n');
  return { signatureInput, signatureBase };
}

export async function createEbayFinanceSignatureHeaders(
  method: 'GET',
  requestUrl: string,
  env: WorkerEnv,
): Promise<Record<string, string>> {
  const key = await loadOrCreateSigningKey(env);
  const privateKey = await decryptEbayValue(key.private_key_ciphertext, env);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(privateKey),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const created = Math.floor(Date.now() / 1000);
  const { signatureInput, signatureBase } = buildEbaySignatureComponents(method, requestUrl, key.public_key_jwe, created);
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    cryptoKey,
    new TextEncoder().encode(signatureBase),
  );
  return {
    'x-ebay-signature-key': key.public_key_jwe,
    'Signature-Input': signatureInput,
    Signature: `sig1=:${encodeBase64(new Uint8Array(signature))}:`,
  };
}

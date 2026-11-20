import type { WorkerEnv } from './types';

const encoder = new TextEncoder();
const decodeBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
};
const encodeBase64Url = (value: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
};
const jsonPart = (value: unknown): string => encodeBase64Url(encoder.encode(JSON.stringify(value)));

async function createVapidAuthorization(endpoint: string, env: WorkerEnv): Promise<string> {
  const publicKey = env.VAPID_PUBLIC_KEY!;
  const privateKey = decodeBase64Url(env.VAPID_PRIVATE_KEY!);
  const publicBytes = decodeBase64Url(publicKey);
  if (publicBytes.length !== 65 || privateKey.length !== 32) throw new Error('VAPID keys must be a P-256 public key and 32-byte private scalar.');
  const header = jsonPart({ typ: 'JWT', alg: 'ES256' });
  const audience = new URL(endpoint).origin;
  const claims = jsonPart({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: env.VAPID_SUBJECT });
  const signingInput = encoder.encode(header + '.' + claims);
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    x: encodeBase64Url(publicBytes.slice(1, 33)),
    y: encodeBase64Url(publicBytes.slice(33, 65)),
    d: encodeBase64Url(privateKey),
    ext: true, key_ops: ['sign'],
  };
  const signingKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, signingInput));
  return `vapid t=${header}.${claims}.${encodeBase64Url(signature)}, k=${publicKey}`;
}

export async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth_secret: string },
  payload: { title: string; body: string; url: string; notificationId: string },
  env: WorkerEnv,
): Promise<{ ok: boolean; status?: number }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return { ok: false };
  try {
    const uaPublic = decodeBase64Url(subscription.p256dh);
    const authSecret = decodeBase64Url(subscription.auth_secret);
    if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Invalid Web Push subscription keys.');

    const subscriberKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
    const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subscriberKey }, ephemeral.privateKey, 256));
    const info = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
    const inputKeyMaterial = await hkdf(sharedSecret, authSecret, info, 32);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const recordSize = new Uint8Array([0, 0, 16, 0]);
    const keyInfo = concat(encoder.encode('Content-Encoding: aes128gcm\0'), recordSize, new Uint8Array([asPublic.length]), asPublic);
    const contentKey = await hkdf(inputKeyMaterial, salt, keyInfo, 16);
    const nonce = await hkdf(inputKeyMaterial, salt, encoder.encode('Content-Encoding: nonce\0'), 12);
    const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
    const plaintext = concat(encoder.encode(JSON.stringify(payload)), new Uint8Array([2]));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext));
    const body = concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
    const authorization = await createVapidAuthorization(subscription.endpoint, env);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        TTL: '86400',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      },
      body,
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}

import { createClient } from '@supabase/supabase-js';
import type { AuthContext, WorkerEnv } from '../types';
import { json } from '../http';
import { resolveEffectivePermissions } from '../permission-overrides';

export type EbayEnvironment = 'SANDBOX' | 'PRODUCTION';

export const REQUIRED_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
];

export type OAuthConfig = { clientId: string; clientSecret: string; ruName: string; environment: EbayEnvironment };

export function configFor(env: WorkerEnv, environment: EbayEnvironment): OAuthConfig | null {
  const sandbox = environment === 'SANDBOX';
  const clientId = sandbox ? env.EBAY_SANDBOX_CLIENT_ID : env.EBAY_PRODUCTION_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_PRODUCTION_CLIENT_SECRET;
  const ruName = sandbox ? env.EBAY_SANDBOX_RUNAME : env.EBAY_PRODUCTION_RUNAME;
  if (!clientId || !clientSecret || !ruName) return null;
  return { clientId, clientSecret, ruName, environment };
}

export function serviceClient(env: WorkerEnv): any {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export async function encryptToken(plaintext: string, encodedKey: string, associatedData = ''): Promise<string> {
  const rawKey = fromBase64(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error('Token encryption key must decode to exactly 32 bytes.');
  const key = await crypto.subtle.importKey('raw', rawKey.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: new TextEncoder().encode(associatedData).buffer as ArrayBuffer }, key, new TextEncoder().encode(plaintext).buffer as ArrayBuffer);
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(ciphertext: string, encodedKey: string, associatedData = ''): Promise<string> {
  const [version, ivText, dataText] = ciphertext.split('.');
  if (version !== 'v1' || !ivText || !dataText) throw new Error('Unsupported encrypted token format.');
  const rawKey = fromBase64(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error('Token encryption key must decode to exactly 32 bytes.');
  const key = await crypto.subtle.importKey('raw', rawKey.buffer as ArrayBuffer, 'AES-GCM', false, ['decrypt']);
  const iv = fromBase64(ivText);
  const data = fromBase64(dataText);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: new TextEncoder().encode(associatedData).buffer as ArrayBuffer }, key, data.buffer as ArrayBuffer);
  return new TextDecoder().decode(decrypted);
}

export function tokenEndpoint(environment: EbayEnvironment): string {
  return environment === 'SANDBOX'
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token';
}

function authorizationEndpoint(environment: EbayEnvironment): string {
  return environment === 'SANDBOX'
    ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
    : 'https://auth.ebay.com/oauth2/authorize';
}

export function basicAuthorization(config: OAuthConfig): string {
  return `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
}

export async function logEvent(
  client: any,
  input: { organizationId: string; accountId: string; eventType: string; severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'; errorCode?: string; message: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await client.from('marketplace_integration_events').insert({
    organization_id: input.organizationId,
    marketplace_account_id: input.accountId,
    event_type: input.eventType,
    severity: input.severity,
    error_code: input.errorCode || null,
    message: input.message.slice(0, 500),
    metadata: input.metadata || {},
  });
}

function callbackPage(title: string, message: string, success: boolean): Response {
  const safeTitle = title.replace(/[&<>"]/g, '');
  const safeMessage = message.replace(/[&<>"]/g, '');
  const color = success ? '#166534' : '#991b1b';
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#111827"><h1 style="color:${color}">${safeTitle}</h1><p>${safeMessage}</p><p>You can close this window and return to MultiAcc.</p></body></html>`,
    { status: success ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}

export function isEbayOAuthConfigured(env: WorkerEnv, environment: EbayEnvironment = 'SANDBOX'): boolean {
  return Boolean(
    configFor(env, environment) &&
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.EBAY_TOKEN_ENCRYPTION_KEY,
  );
}

export async function startEbayOAuth(
  accountId: string,
  auth: AuthContext,
  env: WorkerEnv,
): Promise<Response> {
  if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) {
    return json({ error: 'Marketplace management permission is required.' }, 403);
  }
  const { data: account, error: accountError } = await auth.repositoryContext.supabase
    .from('marketplace_accounts')
    .select('id,organization_id,marketplace,environment,is_demo,auth_status')
    .eq('id', accountId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (accountError) return json({ error: 'Marketplace account could not be verified.' }, 403);
  if (!account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
  if (account.marketplace === 'OTHER') return json({ error: 'Only eBay marketplace accounts can use this authorization flow.' }, 400);
  if (account.is_demo) return json({ error: 'Demo marketplace accounts cannot be connected. Create a real marketplace account first.' }, 409);
  if (account.environment !== 'SANDBOX' && account.environment !== 'PRODUCTION') {
    return json({ error: 'The marketplace account environment is invalid.' }, 400);
  }

  const environment = account.environment as EbayEnvironment;
  const config = configFor(env, environment);
  const service = serviceClient(env);
  if (!config || !service || !env.EBAY_TOKEN_ENCRYPTION_KEY) {
    return json({ error: 'Secure eBay authorization is not configured yet. No credentials were changed.' }, 503);
  }

  const rawState = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const stateHash = await sha256Hex(rawState);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: stateError } = await service.from('marketplace_oauth_states').insert({
    state_hash: stateHash,
    organization_id: auth.organizationId,
    marketplace_account_id: account.id,
    user_id: auth.user.id,
    environment,
    expires_at: expiresAt,
  });
  if (stateError) return json({ error: 'A secure authorization session could not be created.' }, 500);

  const authorizeUrl = new URL(authorizationEndpoint(environment));
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', config.ruName);
  authorizeUrl.searchParams.set('scope', REQUIRED_SCOPES.join(' '));
  authorizeUrl.searchParams.set('state', rawState);
  authorizeUrl.searchParams.set('prompt', 'login');

  await logEvent(service, {
    organizationId: auth.organizationId,
    accountId: account.id,
    eventType: 'OAUTH_STARTED',
    severity: 'INFO',
    message: 'Seller authorization was started. The one-time state expires in ten minutes.',
    metadata: { environment, userId: auth.user.id },
  });

  return json({ authorizationUrl: authorizeUrl.toString(), expiresAt });
}

export async function handleEbayOAuthCallback(request: Request, env: WorkerEnv): Promise<Response> {
  const service = serviceClient(env);
  if (!service || !env.EBAY_TOKEN_ENCRYPTION_KEY) {
    return callbackPage('MultiAcc authorization is not configured', 'The secure server configuration is incomplete. Please contact the workspace administrator.', false);
  }

  const url = new URL(request.url);
  const rawState = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const providerError = url.searchParams.get('error') || '';
  if (!rawState || rawState.length > 256) {
    return callbackPage('Authorization could not be verified', 'The one-time authorization state is missing or invalid. Start the connection again from MultiAcc.', false);
  }

  const stateHash = await sha256Hex(rawState);
  const { data: state, error: stateError } = await service
    .from('marketplace_oauth_states')
    .delete()
    .eq('state_hash', stateHash)
    .gt('expires_at', new Date().toISOString())
    .select('organization_id,marketplace_account_id,user_id,environment')
    .maybeSingle();

  if (stateError || !state) {
    return callbackPage('Authorization expired or already used', 'This authorization request is expired, invalid, or has already been used. Return to MultiAcc and start again.', false);
  }

  const environment = state.environment as EbayEnvironment;
  const [{ data: membership }, { data: account }] = await Promise.all([
    service.from('organization_members')
      .select('role_id,is_active,roles(code)')
      .eq('organization_id', state.organization_id)
      .eq('user_id', state.user_id)
      .maybeSingle(),
    service.from('marketplace_accounts')
      .select('id,organization_id,marketplace,environment,is_demo')
      .eq('id', state.marketplace_account_id)
      .eq('organization_id', state.organization_id)
      .maybeSingle(),
  ]);
  if (!membership?.is_active || !account || account.is_demo || account.environment !== environment || !['EBAY_UK','EBAY_US','EBAY_DE'].includes(account.marketplace)) {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_CALLBACK_AUTHORIZATION_REVOKED', severity: 'WARNING', errorCode: 'MEMBERSHIP_OR_ACCOUNT_CHANGED', message: 'The user or marketplace account is no longer eligible to complete authorization.' });
    return callbackPage('Authorization no longer permitted', 'Your workspace access or marketplace account changed while eBay authorization was open. Return to MultiAcc and ask an administrator to review access.', false);
  }

  const [roleRowsResult, overrideRowsResult] = await Promise.all([
    service.from('role_permissions').select('permissions(code)').eq('role_id', membership.role_id),
    service.from('organization_member_permission_overrides').select('effect,permissions(code)').eq('organization_id', state.organization_id).eq('user_id', state.user_id),
  ]);
  if (roleRowsResult.error || overrideRowsResult.error) {
    return callbackPage('Authorization could not be verified', 'MultiAcc could not re-check your current workspace permissions. Restart the connection after the administrator verifies access.', false);
  }
  const roleCodeRelation = membership.roles;
  const roleCode = Array.isArray(roleCodeRelation) ? roleCodeRelation[0]?.code : (roleCodeRelation as any)?.code;
  const basePermissions = (roleRowsResult.data || []).map((row: any) => {
    const relation = row.permissions;
    return Array.isArray(relation) ? relation[0]?.code : relation?.code;
  }).filter((value: unknown): value is string => typeof value === 'string');
  const overrides = (overrideRowsResult.data || []).map((row: any) => {
    const relation = row.permissions;
    const code = Array.isArray(relation) ? relation[0]?.code : relation?.code;
    return { effect: row.effect, code };
  }).filter((row: any) => typeof row.code === 'string');
  if (typeof roleCode !== 'string') {
    return callbackPage('Authorization could not be verified', 'Your workspace role could not be verified. Ask an administrator to review access.', false);
  }
  const currentPermissions = resolveEffectivePermissions(roleCode, basePermissions, overrides);
  if (!currentPermissions.has('*') && !currentPermissions.has('marketplace.manage')) {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_CALLBACK_PERMISSION_DENIED', severity: 'WARNING', errorCode: 'MARKETPLACE_MANAGE_REVOKED', message: 'Marketplace management permission was removed before OAuth callback.' });
    return callbackPage('Marketplace permission was removed', 'Your current workspace role no longer permits connecting this eBay account.', false);
  }

  const config = configFor(env, environment);
  if (!config) {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_CONFIGURATION_MISSING', severity: 'ERROR', message: 'The eBay application configuration is incomplete.' });
    return callbackPage('Authorization configuration is incomplete', 'The eBay application settings for this environment are missing.', false);
  }

  if (providerError || !code || code.length > 1024) {
    await logEvent(service, {
      organizationId: state.organization_id,
      accountId: state.marketplace_account_id,
      eventType: 'OAUTH_DECLINED',
      severity: 'WARNING',
      errorCode: providerError ? 'SELLER_DECLINED' : 'MISSING_AUTHORIZATION_CODE',
      message: 'The seller did not complete the eBay authorization.',
    });
    return callbackPage('eBay authorization was not completed', 'No account connection was created. You can try again from MultiAcc.', false);
  }

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.ruName,
  });
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenEndpoint(environment), {
      method: 'POST',
      headers: {
        Authorization: basicAuthorization(config),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    });
  } catch {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_TOKEN_EXCHANGE_FAILED', severity: 'ERROR', errorCode: 'EBAY_UNREACHABLE', message: 'The eBay token service could not be reached.' });
    return callbackPage('eBay could not be reached', 'The authorization code was not stored. Please restart the connection.', false);
  }

  if (!tokenResponse.ok) {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_TOKEN_EXCHANGE_FAILED', severity: 'ERROR', errorCode: `HTTP_${tokenResponse.status}`, message: 'eBay rejected the authorization-code exchange.' });
    return callbackPage('eBay authorization failed', 'eBay did not issue an account token. No connected status was recorded.', false);
  }

  const tokenData = await tokenResponse.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number;
    refresh_token_expires_in?: number; token_type?: string;
  };
  const expiresIn = tokenData.expires_in;
  const refreshTokenExpiresIn = tokenData.refresh_token_expires_in;
  if (!tokenData.access_token || !tokenData.refresh_token || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || typeof refreshTokenExpiresIn !== 'number' || !Number.isFinite(refreshTokenExpiresIn)) {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_TOKEN_RESPONSE_INVALID', severity: 'ERROR', message: 'eBay returned an incomplete token response.' });
    return callbackPage('eBay returned an incomplete response', 'The account was not marked as connected. Please restart authorization.', false);
  }

  try {
    const [accessCiphertext, refreshCiphertext] = await Promise.all([
      encryptToken(tokenData.access_token, env.EBAY_TOKEN_ENCRYPTION_KEY, `${state.organization_id}:${state.marketplace_account_id}:access`),
      encryptToken(tokenData.refresh_token, env.EBAY_TOKEN_ENCRYPTION_KEY, `${state.organization_id}:${state.marketplace_account_id}:refresh`),
    ]);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + refreshTokenExpiresIn * 1000).toISOString();

    const { error: credentialError } = await service.from('marketplace_credentials').upsert({
      organization_id: state.organization_id,
      marketplace_account_id: state.marketplace_account_id,
      access_token_ciphertext: accessCiphertext,
      refresh_token_ciphertext: refreshCiphertext,
      encryption_key_version: 'v1',
      token_type: tokenData.token_type || 'User Access Token',
      scopes: REQUIRED_SCOPES,
      expires_at: expiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      last_refreshed_at: now.toISOString(),
      revoked_at: null,
      updated_at: now.toISOString(),
    }, { onConflict: 'marketplace_account_id' });
    if (credentialError) throw new Error('CREDENTIAL_STORAGE_FAILED');

    const { error: accountUpdateError } = await service.from('marketplace_accounts')
      .update({
        auth_status: 'CONNECTED',
        token_expires_at: expiresAt,
        last_sync_status: 'NOT_SYNCED',
        last_sync_message: 'eBay authorization completed. No orders have been synchronized yet.',
        updated_at: now.toISOString(),
      })
      .eq('id', state.marketplace_account_id)
      .eq('organization_id', state.organization_id);
    if (accountUpdateError) throw new Error('ACCOUNT_STATUS_UPDATE_FAILED');

    await logEvent(service, {
      organizationId: state.organization_id,
      accountId: state.marketplace_account_id,
      eventType: 'OAUTH_CONNECTED',
      severity: 'INFO',
      message: 'eBay seller authorization completed and encrypted tokens were stored.',
      metadata: { environment, scopes: REQUIRED_SCOPES, expiresAt },
    });
  } catch {
    await logEvent(service, { organizationId: state.organization_id, accountId: state.marketplace_account_id, eventType: 'OAUTH_STORAGE_FAILED', severity: 'CRITICAL', errorCode: 'SECURE_STORAGE_FAILED', message: 'Token encryption or secure credential storage failed. The account was not confirmed as connected.' });
    return callbackPage('Secure token storage failed', 'MultiAcc could not safely store the authorization. The account was not confirmed as connected.', false);
  }

  return callbackPage('eBay account connected', 'Your eBay authorization was verified and the tokens were encrypted before storage. Order synchronization has not started yet.', true);
}

export async function refreshExpiringEbayTokens(env: WorkerEnv): Promise<void> {
  const service = serviceClient(env);
  const encryptionKey = env.EBAY_TOKEN_ENCRYPTION_KEY;
  if (!service || !encryptionKey) return;

  const refreshBefore = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: credentials, error } = await service
    .from('marketplace_credentials')
    .select('organization_id,marketplace_account_id,refresh_token_ciphertext,encryption_key_version,scopes,expires_at,refresh_token_expires_at,marketplace_accounts!marketplace_credentials_account_org_fkey!inner(environment)')
    .not('refresh_token_ciphertext', 'is', null)
    .is('revoked_at', null)
    .lt('expires_at', refreshBefore)
    .limit(50);
  if (error || !credentials?.length) return;

  for (const credential of credentials as any[]) {
    const account = Array.isArray(credential.marketplace_accounts)
      ? credential.marketplace_accounts[0] : credential.marketplace_accounts;
    const environment = account?.environment as EbayEnvironment;
    const config = configFor(env, environment);
    if (!config) continue;

    try {
      const refreshToken = await decryptToken(credential.refresh_token_ciphertext, encryptionKey, `${credential.organization_id}:${credential.marketplace_account_id}:refresh`);
      const form = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: (credential.scopes || REQUIRED_SCOPES).join(' '),
      });
      const response = await fetch(tokenEndpoint(environment), {
        method: 'POST',
        headers: {
          Authorization: basicAuthorization(config),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        const revoked = response.status === 400 && body.error === 'invalid_grant';
        await logEvent(service, {
          organizationId: credential.organization_id,
          accountId: credential.marketplace_account_id,
          eventType: revoked ? 'OAUTH_REFRESH_REVOKED' : 'OAUTH_REFRESH_FAILED',
          severity: revoked ? 'ERROR' : 'WARNING',
          errorCode: revoked ? 'INVALID_GRANT' : `HTTP_${response.status}`,
          message: revoked ? 'eBay rejected the refresh token. Seller authorization is required again.' : 'The eBay token refresh failed and will be retried.',
        });
        if (revoked) {
          await service.from('marketplace_credentials').update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('marketplace_account_id', credential.marketplace_account_id);
          await service.from('marketplace_accounts').update({ auth_status: 'EXPIRED', last_sync_status: 'AUTH_REQUIRED', last_sync_message: 'eBay authorization expired or was revoked. Reconnect this account.' }).eq('id', credential.marketplace_account_id).eq('organization_id', credential.organization_id);
        }
        continue;
      }

      const tokenData = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number };
      if (!tokenData.access_token || !Number.isFinite(tokenData.expires_in)) throw new Error('INVALID_REFRESH_RESPONSE');
      const accessCiphertext = await encryptToken(tokenData.access_token, encryptionKey, `${credential.organization_id}:${credential.marketplace_account_id}:access`);
      const refreshCiphertext = tokenData.refresh_token
        ? await encryptToken(tokenData.refresh_token, encryptionKey, `${credential.organization_id}:${credential.marketplace_account_id}:refresh`)
        : credential.refresh_token_ciphertext;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + tokenData.expires_in! * 1000).toISOString();
      const updates: Record<string, unknown> = {
        access_token_ciphertext: accessCiphertext,
        refresh_token_ciphertext: refreshCiphertext,
        expires_at: expiresAt,
        last_refreshed_at: now.toISOString(),
        updated_at: now.toISOString(),
        revoked_at: null,
      };
      if (Number.isFinite(tokenData.refresh_token_expires_in)) {
        updates.refresh_token_expires_at = new Date(now.getTime() + tokenData.refresh_token_expires_in! * 1000).toISOString();
      }
      const { error: updateError } = await service.from('marketplace_credentials').update(updates).eq('marketplace_account_id', credential.marketplace_account_id);
      if (updateError) throw new Error('CREDENTIAL_REFRESH_STORAGE_FAILED');
      await service.from('marketplace_accounts').update({ auth_status: 'CONNECTED', token_expires_at: expiresAt, updated_at: now.toISOString() }).eq('id', credential.marketplace_account_id).eq('organization_id', credential.organization_id);
      await logEvent(service, { organizationId: credential.organization_id, accountId: credential.marketplace_account_id, eventType: 'OAUTH_REFRESHED', severity: 'INFO', message: 'The eBay access token was refreshed and encrypted successfully.' });
    } catch {
      await logEvent(service, { organizationId: credential.organization_id, accountId: credential.marketplace_account_id, eventType: 'OAUTH_REFRESH_ERROR', severity: 'ERROR', errorCode: 'REFRESH_PROCESSING_FAILED', message: 'The token refresh could not be completed safely.' });
    }
  }
}

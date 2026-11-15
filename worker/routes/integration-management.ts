import type { AuthContext, WorkerEnv } from '../types';
import { json } from '../http';
import { encryptToken, serviceClient } from '../ebay/oauth';

type EbayEnvironment = 'SANDBOX' | 'PRODUCTION';
const cleanCredential = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
};
const aad = (environment: EbayEnvironment, field: string) => `platform:EBAY:${environment}:${field}:v1`;

export async function handleIntegrationManagementRoute(
  path: string, request: Request, auth: AuthContext, env: WorkerEnv,
): Promise<Response | null> {
  if (!path.startsWith('/integrations/')) return null;
  // Organization-level SUPER_ADMIN is not automatically a platform owner.
  // A separate deployment-controlled allowlist prevents tenant admins from
  // reading or rotating the application's shared Developer credentials.
  const platformAdmins = (env.PLATFORM_SUPER_ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (auth.user.role !== 'SUPER_ADMIN' || !platformAdmins.includes(auth.user.id)) {
    return json({ error: 'Platform owner authorization is required.' }, 403);
  }

  const service = serviceClient(env);
  if (!service) return json({ error: 'Secure integration storage is unavailable.' }, 503);
  const encryptionKey = env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY;
  if (!encryptionKey) return json({ error: 'The integration credential encryption service is not configured.' }, 503);

  if (path === '/integrations/ebay/audit' && request.method === 'GET') {
    const { data, error } = await service.from('platform_integration_audit')
      .select('environment,actor_user_id,action,credential_version,metadata,created_at')
      .eq('provider', 'EBAY').order('created_at', { ascending: false }).limit(50);
    if (error) return json({ error: 'Integration audit history could not be loaded.' }, 500);
    return json({ events: (data || []).map((row: any) => ({
      environment: row.environment, actorUserId: row.actor_user_id, action: row.action,
      credentialVersion: row.credential_version, metadata: row.metadata, createdAt: row.created_at,
    })) });
  }

  if (path === '/integrations/ebay/credentials' && request.method === 'GET') {
    const { data, error } = await service.from('platform_integration_credentials')
      .select('environment,client_id_masked,credential_version,updated_at')
      .eq('provider', 'EBAY').order('environment');
    if (error) return json({ error: 'Integration credential status could not be loaded.' }, 500);
    const byEnvironment = new Map((data || []).map((row: any) => [row.environment, row]));
    return json({
      provider: 'EBAY',
      environments: (['SANDBOX','PRODUCTION'] as const).map(environment => {
        const row = byEnvironment.get(environment) as any;
        return {
          environment, configured: Boolean(row), clientIdMasked: row?.client_id_masked || '',
          credentialVersion: row?.credential_version || 0, updatedAt: row?.updated_at || null,
          secretsAreNeverReturned: true,
        };
      }),
    });
  }

  const match = path.match(/^\/integrations\/ebay\/credentials\/(SANDBOX|PRODUCTION)$/);
  if (match && request.method === 'PUT') {
    if (auth.assuranceLevel !== 'aal2') return json({ error: 'Complete an authenticator MFA verification before managing platform credentials.' }, 403);
    const origin = request.headers.get('Origin');
    const requestOrigin = new URL(request.url).origin;
    if (!origin || (origin !== requestOrigin && origin !== env.ALLOWED_ORIGIN)) {
      return json({ error: 'A same-origin browser request is required for credential changes.' }, 403);
    }
    const environment = match[1] as EbayEnvironment;
    if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
      return json({ error: 'Content-Type must be application/json.' }, 415);
    }
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { return json({ error: 'A valid JSON request is required.' }, 400); }

    if (Object.keys(body).some(key => !['clientId', 'clientSecret', 'ruName'].includes(key))) {
      return json({ error: 'Unexpected credential fields were supplied.' }, 400);
    }
    if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) {
      return json({ error: 'A valid expected credential version is required. Refresh the page and try again.' }, 409);
    }
    const clientId = cleanCredential(body.clientId, 256);
    const clientSecret = cleanCredential(body.clientSecret, 512);
    const ruName = cleanCredential(body.ruName, 256);
    if (!clientId || !clientSecret || !ruName) {
      return json({ error: 'Client ID, Client Secret and RuName are all required. Existing values remain unchanged.' }, 400);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(clientId)) return json({ error: 'The Client ID format is invalid.' }, 400);
    if (!/^[A-Za-z0-9_-]+$/.test(ruName)) return json({ error: 'The RuName format is invalid.' }, 400);

    try {
      const [clientIdCipher, clientSecretCipher, ruNameCipher] = await Promise.all([
        encryptToken(clientId, encryptionKey, aad(environment, 'client-id')),
        encryptToken(clientSecret, encryptionKey, aad(environment, 'client-secret')),
        encryptToken(ruName, encryptionKey, aad(environment, 'runame')),
      ]);
      const masked = `${clientId.slice(0, 3)}••••${clientId.slice(-4)}`;
      const { data, error } = await service.rpc('save_platform_integration_credentials', {
        p_environment: environment,
        p_expected_version: Number(body.expectedVersion),
        p_client_id_ciphertext: clientIdCipher,
        p_client_secret_ciphertext: clientSecretCipher,
        p_ru_name_ciphertext: ruNameCipher,
        p_client_id_masked: masked,
        p_actor_user_id: auth.user.id,
      });
      if (error || !data?.length) return json({ error: 'Encrypted credentials and their audit record could not be saved. No success was reported.' }, 500);
      const result = data[0];
      return json({
        saved: true, environment, credentialVersion: result.credential_version,
        updatedAt: result.saved_at, secretsReturned: false,
      });
    } catch {
      return json({ error: 'Credentials could not be encrypted or saved. No secret values were logged.' }, 503);
    }
  }
  return null;
}

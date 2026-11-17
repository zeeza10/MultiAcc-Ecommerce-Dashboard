import type { AuthContext } from '../types';
import { json } from '../http';

import { SupabaseReturnRepository } from '../../server/repositories/returnRepository';


export async function handleReturnRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
  if (path === '/returns' && request.method === 'GET') {
    const returns = await new SupabaseReturnRepository(auth.repositoryContext).listReturns(url.searchParams.get('accountId') || undefined);
    return json({ returns });
  }

  const returnDispositionMatch = path.match(/^\/returns\/([^/]+)\/disposition$/);
  if (returnDispositionMatch && request.method === 'POST') {
    if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot process workspace returns.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    if (!Array.isArray(body.dispositions) || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) {
      return json({ error: 'Return dispositions and an idempotency key are required.' }, 400);
    }
    const result = await new SupabaseReturnRepository(auth.repositoryContext).processDisposition(
      returnDispositionMatch[1],
      body.dispositions as Array<{ lineId: string; disposition: string; quantity: number }>,
      Boolean(body.issueRefund),
      body.idempotencyKey,
    );
    return json(result);
  }

  return null;
}

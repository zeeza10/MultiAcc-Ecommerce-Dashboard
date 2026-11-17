/** Platform-level authorization helpers. The JWT assurance claim is read only
 * after Supabase auth.getUser(token) has verified the token signature. */
export function readVerifiedJwtAssurance(token: string): 'aal1' | 'aal2' {
  try {
    const segment = token.split('.')[1];
    if (!segment) return 'aal1';
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return payload?.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

/** Workspace Super Admin is not equivalent to platform owner. Fail closed when
 * the deployment-controlled user ID allowlist is absent or malformed. */
export function isPlatformAdminUser(userId: string, role: string, allowlist: string | undefined): boolean {
  if (!userId || role !== 'SUPER_ADMIN' || !allowlist) return false;
  const allowedIds = new Set(allowlist.split(',').map(value => value.trim()).filter(Boolean));
  return allowedIds.has(userId);
}

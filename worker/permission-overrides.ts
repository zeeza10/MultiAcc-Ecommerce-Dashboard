export type PermissionOverride = { effect: 'GRANT' | 'DENY'; code: string };

export function resolveEffectivePermissions(
  roleCode: string,
  rolePermissionCodes: string[],
  overrides: PermissionOverride[],
): Set<string> {
  if (roleCode === 'SUPER_ADMIN') return new Set(['*']);
  const effective = new Set(rolePermissionCodes);
  for (const override of overrides) {
    if (override.effect === 'GRANT') effective.add(override.code);
    else if (override.effect === 'DENY') effective.delete(override.code);
  }
  return effective;
}

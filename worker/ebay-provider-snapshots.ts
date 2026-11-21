type SnapshotAccount = { id: string; organization_id: string };

export async function saveEbayProviderSnapshot(
  admin: any,
  account: SnapshotAccount,
  resourceType: string,
  externalId: string,
  syncBatchId: string,
  snapshot: Record<string, unknown>,
  rawPayload: unknown,
  providerUpdatedAt: string | null = null,
): Promise<string> {
  const { data, error } = await admin.from('marketplace_provider_snapshots').upsert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    resource_type: resourceType,
    external_id: externalId,
    sync_batch_id: syncBatchId,
    provider_updated_at: providerUpdatedAt,
    snapshot,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'marketplace_account_id,resource_type,external_id' })
    .select('id').single();
  if (error || !data?.id) throw new Error('The normalized eBay provider snapshot could not be stored.');

  const { error: rawError } = await admin.from('marketplace_provider_raw_payloads').upsert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    snapshot_id: data.id,
    payload: rawPayload && typeof rawPayload === 'object' ? rawPayload : { value: rawPayload ?? null },
  }, { onConflict: 'snapshot_id' });
  if (rawError) throw new Error('The restricted eBay provider payload could not be stored.');
  return String(data.id);
}

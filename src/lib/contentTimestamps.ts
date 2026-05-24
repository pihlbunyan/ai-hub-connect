/** ISO timestamps for agent-generated inserts and upsert updates. */
export function contentTimestamps(isNew: boolean): { created_at?: string; updated_at: string } {
  const now = new Date().toISOString();
  return isNew ? { created_at: now, updated_at: now } : { updated_at: now };
}

/**
 * Timestamps for PostgREST upsert — always set both columns.
 * Omitting created_at on conflict can write NULL and violate NOT NULL.
 */
export function upsertContentTimestamps(existingCreatedAt?: string | null): {
  created_at: string;
  updated_at: string;
} {
  const now = new Date().toISOString();
  return {
    created_at: existingCreatedAt ?? now,
    updated_at: now,
  };
}

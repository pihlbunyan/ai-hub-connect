/** ISO timestamps for agent-generated inserts and upsert updates. */
export function contentTimestamps(isNew: boolean): { created_at?: string; updated_at: string } {
  const now = new Date().toISOString();
  return isNew ? { created_at: now, updated_at: now } : { updated_at: now };
}

/**
 * Cloud records only need a consistent update timestamp. There is no local
 * dirty flag because the application has no offline queue or local database.
 */
export function stampRecord<T extends Record<string, any>>(record: T): T & { updated_at: string } {
  return {
    ...record,
    updated_at: new Date().toISOString(),
  };
}

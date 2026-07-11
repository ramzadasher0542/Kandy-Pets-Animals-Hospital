/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SyncEngine — Background bidirectional sync between IndexedDB and Supabase.
 * ---------------------------------------------------------------
 * - Push: dirty local records → Supabase upsert
 * - Pull: remote records newer than last_sync_ts → IndexedDB (LWW)
 * - Completely silent: all errors are caught and logged, never thrown.
 * - When SYNC_ENABLED is false, the engine is entirely dormant.
 */

import { db, safeDbWrite } from './localDb';
import { supabase, SYNC_ENABLED, DB_TABLES } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Store ↔ Table mapping
// ---------------------------------------------------------------------------
interface StoreMapping {
  /** localforage instance key on `db` */
  storeKey: keyof typeof db;
  /** Supabase table name */
  table: string;
  /** Primary-key field name */
  idField: string;
}

const STORE_MAPPINGS: StoreMapping[] = [
  { storeKey: 'inventory',    table: DB_TABLES.INVENTORY,     idField: 'id' },
  { storeKey: 'appointments', table: DB_TABLES.APPOINTMENTS,  idField: 'id' },
  { storeKey: 'records',      table: DB_TABLES.RECORDS,       idField: 'id' },
  { storeKey: 'invoices',     table: DB_TABLES.INVOICES,      idField: 'id' },
  { storeKey: 'clients',      table: 'clients',               idField: 'client_id' },
  { storeKey: 'shifts',       table: 'shifts',                idField: 'id' },
  { storeKey: 'alerts',       table: DB_TABLES.ALERTS,        idField: 'id' },
  { storeKey: 'notifications', table: DB_TABLES.NOTIFICATIONS, idField: 'id' },
  { storeKey: 'clinicQueue',  table: 'clinic_queue',          idField: 'id' },
  // BUG #13 FIX: Users were never synced
  { storeKey: 'users',        table: DB_TABLES.USERS,         idField: 'id' },
  { storeKey: 'cashAdjustments', table: 'cash_adjustments',   idField: 'id' },
  { storeKey: 'shiftReconciliations', table: 'shift_reconciliations', idField: 'id' },
  { storeKey: 'pets',         table: 'pets',                  idField: 'id' },
  { storeKey: 'vaccinations', table: 'vaccinations',          idField: 'id' },
  { storeKey: 'labResults',   table: 'lab_results',           idField: 'id' },
  { storeKey: 'groomingLogs', table: 'grooming_logs',         idField: 'id' },
  { storeKey: 'boardingRecords', table: 'boarding_records',   idField: 'id' },
  { storeKey: 'staffProfiles',    table: 'staff_profiles',    idField: 'id' },
  { storeKey: 'timeEntries',      table: 'time_entries',      idField: 'id' },
  { storeKey: 'scheduleEntries',  table: 'schedule_entries',  idField: 'id' },
  { storeKey: 'payslips',         table: 'payslips',          idField: 'id' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TAG = '[SyncEngine]';
const MIN_INTERVAL_MS = 30_000;     // Rate-limit: at most once per 30 s
const INITIAL_DELAY_MS = 2_000;     // First sync 2 s after start()
const PULL_LIMIT = 500;             // Max rows per pull query
const LAST_SYNC_KEY = 'last_sync_ts';
const DEFAULT_EPOCH = '1970-01-01T00:00:00Z';

// ---------------------------------------------------------------------------
// SyncEngine class
// ---------------------------------------------------------------------------
export class SyncEngine {
  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private initialTimerId: ReturnType<typeof setTimeout> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private lastSyncTime = 0; // epoch-ms of last completed cycle
  private onStatusChange?: (online: boolean) => void;

  constructor(opts?: { onStatusChange?: (online: boolean) => void }) {
    this.onStatusChange = opts?.onStatusChange;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start the engine. Complete no-op when SYNC_ENABLED is false. */
  start(): void {
    if (!SYNC_ENABLED) {
      console.info(`${TAG} Sync disabled (no Supabase credentials). Engine dormant.`);
      return;
    }
    if (this.running) return;
    this.running = true;
    console.info(`${TAG} Starting background sync engine.`);

    // Listen for connectivity changes
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Initialize Realtime subscriptions
    this.setupRealtime();

    // Initial sync after short delay
    this.initialTimerId = setTimeout(() => {
      this.tick();
    }, INITIAL_DELAY_MS);

    // Periodic sync every MIN_INTERVAL_MS
    this.intervalId = setInterval(() => {
      this.tick();
    }, MIN_INTERVAL_MS);
  }

  /** Stop the engine and clean up listeners / timers. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    console.info(`${TAG} Stopping sync engine.`);

    if (this.initialTimerId !== null) {
      clearTimeout(this.initialTimerId);
      this.initialTimerId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  /**
   * Force a sync cycle immediately, bypassing the rate-limit.
   * Returns counts of pushed and pulled records.
   */
  async forceSync(): Promise<{ pushed: number; pulled: number }> {
    if (!SYNC_ENABLED || !supabase) {
      return { pushed: 0, pulled: 0 };
    }
    return this.runCycle();
  }

  // -----------------------------------------------------------------------
  // Internal event handlers
  // -----------------------------------------------------------------------

  private handleOnline = (): void => {
    console.info(`${TAG} Network online — triggering sync.`);
    this.onStatusChange?.(true);
    this.tick();
  };

  private handleOffline = (): void => {
    console.info(`${TAG} Network offline.`);
    this.onStatusChange?.(false);
  };

  // -----------------------------------------------------------------------
  // Realtime
  // -----------------------------------------------------------------------
  private setupRealtime(): void {
    if (!supabase) return;
    
    this.realtimeChannel = supabase.channel('sync-engine-channel');
    
    // Subscribe to all mapped tables
    STORE_MAPPINGS.forEach(mapping => {
      this.realtimeChannel!.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: mapping.table },
        async (payload) => {
          this.handleRealtimeEvent(mapping, payload);
        }
      );
    });

    this.realtimeChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info(`${TAG} Realtime synced to Supabase channels.`);
      }
    });
  }

  private async handleRealtimeEvent(mapping: StoreMapping, payload: any): Promise<void> {
    const store = (db as any)[mapping.storeKey];
    if (!store) return;

    try {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const cloudRecord = payload.new;
        const localRecord = await store.getItem(cloudRecord[mapping.idField]);
        
        // Conflict resolution: only overwrite if cloud is newer or local doesn't exist
        if (!localRecord || new Date(cloudRecord.updated_at).getTime() >= new Date(localRecord.updated_at).getTime()) {
          // Keep _dirty false because this came from the cloud
          cloudRecord._dirty = false;
          await safeDbWrite(store, cloudRecord[mapping.idField], cloudRecord);
        }
      } else if (payload.eventType === 'DELETE') {
        const cloudRecord = payload.old;
        await store.removeItem(cloudRecord[mapping.idField]);
      }
    } catch (err) {
      console.error(`${TAG} Realtime event error [${mapping.table}]:`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Tick (rate-limited entry point)
  // -----------------------------------------------------------------------

  private tick(): void {
    if (!navigator.onLine) return;
    const now = Date.now();
    if (now - this.lastSyncTime < MIN_INTERVAL_MS) return;
    this.lastSyncTime = now;
    // Fire-and-forget — errors handled inside
    this.runCycle().catch(() => {});
  }

  // -----------------------------------------------------------------------
  // Core sync cycle
  // -----------------------------------------------------------------------

  private async runCycle(): Promise<{ pushed: number; pulled: number }> {
    let pushed = 0;
    let pulled = 0;

    try {
      pulled = await this.pullAll();
    } catch (err) {
      console.error(`${TAG} Pull phase error:`, err);
    }

    try {
      pushed = await this.pushAll();
    } catch (err) {
      console.error(`${TAG} Push phase error:`, err);
    }

    console.info(`${TAG} Cycle complete — pushed: ${pushed}, pulled: ${pulled}`);
    return { pushed, pulled };
  }

  // -----------------------------------------------------------------------
  // PUSH: local dirty → Supabase
  // -----------------------------------------------------------------------

  private async pushAll(): Promise<number> {
    let totalPushed = 0;

    for (const mapping of STORE_MAPPINGS) {
      try {
        const pushed = await this.pushStore(mapping);
        totalPushed += pushed;
      } catch (err) {
        console.error(`${TAG} Push error [${mapping.table}]:`, err);
      }
    }

    return totalPushed;
  }

  private async pushStore(mapping: StoreMapping): Promise<number> {
    const store = db[mapping.storeKey];
    const dirtyRecords: Array<{ key: string; record: any }> = [];

    // Collect dirty records
    await store.iterate((value: any, key: string) => {
      if (value && value._dirty === true) {
        dirtyRecords.push({ key, record: value });
      }
    });

    if (dirtyRecords.length === 0) return 0;

    // Strip _dirty before sending and map feedingPlan to feeding_plan for boarding_records
    const payload = dirtyRecords.map(({ record }) => {
      let clean: any = { ...record };
      delete clean._dirty;
      if (mapping.table === 'boarding_records' && clean.feedingPlan !== undefined) {
        const { feedingPlan, ...rest } = clean;
        clean = { ...rest, feeding_plan: feedingPlan };
      }
      return clean;
    });

    // Upsert to Supabase
    const { error } = await supabase!
      .from(mapping.table)
      .upsert(payload, { onConflict: mapping.idField });

    if (error) {
      console.error(`${TAG} Upsert failed [${mapping.table}]:`, error.message);
      return 0; // Will retry next cycle
    }

    // Clear _dirty flag locally
    for (const { key, record } of dirtyRecords) {
      try {
        const updated = { ...record, _dirty: false };
        await store.setItem(key, updated);
      } catch (err) {
        console.error(`${TAG} Failed to clear _dirty for key "${key}" [${mapping.table}]:`, err);
      }
    }

    return dirtyRecords.length;
  }

  // -----------------------------------------------------------------------
  // PULL: Supabase → local (Last-Write-Wins)
  // -----------------------------------------------------------------------

  private async pullAll(): Promise<number> {
    let totalPulled = 0;

    // Read last_sync_ts
    let lastSync: string = DEFAULT_EPOCH;
    try {
      const stored = await db.system.getItem<string>(LAST_SYNC_KEY);
      if (stored) lastSync = stored;
    } catch (err) {
      console.error(`${TAG} Could not read ${LAST_SYNC_KEY}:`, err);
    }

    let latestTimestamp = lastSync;

    for (const mapping of STORE_MAPPINGS) {
      try {
        // BUG #11 FIX: Loop until all pending records are drained (not just 500)
        let tableSince = lastSync;
        let batchPulled = 0;
        do {
          const { pulled, maxTs } = await this.pullTable(mapping, tableSince);
          batchPulled = pulled;
          totalPulled += pulled;
          if (maxTs && maxTs > latestTimestamp) {
            latestTimestamp = maxTs;
          }
          if (maxTs) tableSince = maxTs;
        } while (batchPulled >= PULL_LIMIT);
      } catch (err) {
        console.error(`${TAG} Pull error [${mapping.table}]:`, err);
      }
    }

    // Persist updated timestamp
    if (latestTimestamp !== lastSync) {
      try {
        await db.system.setItem(LAST_SYNC_KEY, latestTimestamp);
      } catch (err) {
        console.error(`${TAG} Failed to persist ${LAST_SYNC_KEY}:`, err);
      }
    }

    return totalPulled;
  }

  private async pullTable(
    mapping: StoreMapping,
    since: string
  ): Promise<{ pulled: number; maxTs: string | null }> {
    const { data, error } = await supabase!
      .from(mapping.table)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(PULL_LIMIT);

    if (error) {
      console.error(`${TAG} Pull query failed [${mapping.table}]:`, error.message);
      return { pulled: 0, maxTs: null };
    }

    if (!data || data.length === 0) {
      return { pulled: 0, maxTs: null };
    }

    const store = db[mapping.storeKey];
    let pulled = 0;
    let maxTs: string | null = null;

    for (const remote of data) {
      const id: string = remote[mapping.idField];
      if (!id) continue;

      try {
        const local = await store.getItem<any>(id);

        // LWW: accept if local doesn't exist or remote is newer
        const remoteTs = remote.updated_at ?? '';
        const localTs = local?.updated_at ?? '';

        if (!local || remoteTs > localTs) {
          await store.setItem(id, { ...remote, _dirty: false });
          pulled++;
        }

        // Track the highest timestamp in this batch
        if (!maxTs || remoteTs > maxTs) {
          maxTs = remoteTs;
        }
      } catch (err) {
        console.error(`${TAG} Failed to write pulled record "${id}" [${mapping.table}]:`, err);
      }
    }

    return { pulled, maxTs };
  }
}

// ---------------------------------------------------------------------------
// Default singleton factory
// ---------------------------------------------------------------------------
let _instance: SyncEngine | null = null;

/**
 * Returns (and lazily creates) a singleton SyncEngine instance.
 * Call `.start()` to begin syncing.
 */
export function getSyncEngine(opts?: {
  onStatusChange?: (online: boolean) => void;
}): SyncEngine {
  if (!_instance) {
    _instance = new SyncEngine(opts);
  }
  return _instance;
}

export default getSyncEngine;

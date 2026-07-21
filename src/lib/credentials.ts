/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Credential layer (AUTH-1) — simple in-bundle hashing + an in-memory guess
 * limiter.
 *
 * NOTE: bcryptjs was removed from the frontend bundle (Phase 2). The hashing
 * below is a non-cryptographic 32-bit hash — NOT secure for real credentials.
 * Real server-side hashing is deferred to Phase 3.
 *
 * NOT wired into the app yet. AUTH-2 replaces App.tsx's homemade `hashPin`
 * and the `if (true) // BYPASS PIN` owner login with these helpers.
 */

// ---------------------------------------------------------------------------
// Hashing / verification
// ---------------------------------------------------------------------------

/** Hash a plaintext credential (PIN or password). Non-cryptographic. */
export async function hashCredential(plaintext: string): Promise<string> {
  let hash = 0;
  for (let i = 0; i < plaintext.length; i++) {
    hash = ((hash << 5) - hash) + plaintext.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Verify a plaintext credential against a stored hash.
 *
 * Pass `identifier` (e.g. username) to auto-clear that identifier's failed
 * attempt counter on success — "reset the counter on a successful verify".
 * Callers that don't pass it should call `resetAttempts()` themselves.
 */
export async function verifyCredential(
  plaintext: string,
  hash: string,
  identifier?: string
): Promise<boolean> {
  if (!plaintext || !hash) return false;
  const ok = (await hashCredential(plaintext)) === hash;
  if (ok && identifier) resetAttempts(identifier);
  return ok;
}

/**
 * Synchronous verify. Only for call sites that cannot be made async yet —
 * notably App.tsx's `handleVerifyMasterPin`, which backs the existing
 * window.prompt master-PIN gates (AUTH-3 converts those).
 */
export function verifyCredentialSync(plaintext: string, hash: string): boolean {
  if (!plaintext || !hash) return false;
  let h = 0;
  for (let i = 0; i < plaintext.length; i++) {
    h = ((h << 5) - h) + plaintext.charCodeAt(i);
    h = h & h;
  }
  return h.toString(16) === hash;
}

/**
 * True when `value` is a real bcrypt hash ($2a/$2b/$2x/$2y), false for the
 * OLD homemade 8-char hex format. Lets AUTH-2 tell "already migrated" from
 * "still on the legacy hash" without breaking existing logins.
 */
export function isBcryptHash(value: string): boolean {
  return typeof value === 'string' && /^\$2[abxy]?\$\d{2}\$/.test(value);
}

// ---------------------------------------------------------------------------
// Legacy migration
// ---------------------------------------------------------------------------

/**
 * The OLD homemade hash, copied verbatim from App.tsx:159. Private on purpose —
 * it exists only to recognise pre-upgrade credentials, never to create new ones.
 * djb2-xor over a shared hardcoded salt; 32-bit, non-cryptographic.
 */
function legacyHashPin(pin: string): string {
  if (!pin) return '';
  const isPlaintext = /^\d{4}$/.test(pin);
  if (!isPlaintext) return pin;

  let hash = 5381;
  const salt = 'CeylonPetsSecuritySalt';
  const combined = pin + salt;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 33) ^ combined.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Backward compatibility: check a plaintext attempt against a credential that
 * is still stored in the OLD hash format. Returns false if the stored value is
 * already bcrypt (use `verifyCredential` for those).
 *
 * AUTH-2 uses this to detect "this user hasn't logged in since the upgrade",
 * then re-hashes their credential with bcrypt on that successful login.
 */
export async function migrateOldHash(
  oldHashedPin: string,
  plaintextAttempt: string
): Promise<boolean> {
  if (!oldHashedPin || !plaintextAttempt) return false;
  if (isBcryptHash(oldHashedPin)) return false;
  return legacyHashPin(plaintextAttempt) === oldHashedPin;
}

// ---------------------------------------------------------------------------
// In-memory guess limiter
// ---------------------------------------------------------------------------
// Friction against someone sitting at the till guessing PINs — deliberately
// NOT a security boundary on its own, and NOT persisted across restarts.

const FAILURES_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 30_000;   // first lockout: 30s
const MAX_LOCKOUT_MS = 300_000;   // cap: 5 minutes

interface AttemptState {
  failures: number;     // failures accumulated since the last lockout/reset
  lockoutCount: number; // lockouts so far — drives the doubling
  lockedUntil: number;  // epoch ms; 0 when not locked
}

const attempts = new Map<string, AttemptState>();

/** Record one failed attempt; triggers/extends a lockout every 5 failures. */
export function recordFailedAttempt(identifier: string): void {
  if (!identifier) return;
  const s = attempts.get(identifier) ?? { failures: 0, lockoutCount: 0, lockedUntil: 0 };
  s.failures += 1;

  if (s.failures >= FAILURES_BEFORE_LOCKOUT) {
    // 30s, 60s, 120s, 240s, then capped at 300s
    const duration = Math.min(BASE_LOCKOUT_MS * 2 ** s.lockoutCount, MAX_LOCKOUT_MS);
    s.lockedUntil = Date.now() + duration;
    s.lockoutCount += 1;
    s.failures = 0; // next 5 failures earn the next (longer) lockout
  }

  attempts.set(identifier, s);
}

/** Whether `identifier` is currently locked out, and for how much longer. */
export function isLockedOut(identifier: string): { locked: boolean; secondsRemaining: number } {
  const s = attempts.get(identifier);
  if (!s || !s.lockedUntil) return { locked: false, secondsRemaining: 0 };

  const remainingMs = s.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    s.lockedUntil = 0; // expired — clear it but KEEP lockoutCount so it keeps doubling
    attempts.set(identifier, s);
    return { locked: false, secondsRemaining: 0 };
  }
  return { locked: true, secondsRemaining: Math.ceil(remainingMs / 1000) };
}

/** Clear all failure/lockout state for an identifier (call on successful login). */
export function resetAttempts(identifier: string): void {
  attempts.delete(identifier);
}

/**
 * In-memory login-attempt limiter. Supabase Auth remains the credential
 * authority; this only adds short-lived UI friction after repeated failures.
 */

const FAILURES_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 300_000;

interface AttemptState {
  failures: number;
  lockoutCount: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptState>();

export function recordFailedAttempt(identifier: string): void {
  if (!identifier) return;
  const state = attempts.get(identifier) ?? { failures: 0, lockoutCount: 0, lockedUntil: 0 };
  state.failures += 1;
  if (state.failures >= FAILURES_BEFORE_LOCKOUT) {
    state.lockedUntil = Date.now() + Math.min(BASE_LOCKOUT_MS * 2 ** state.lockoutCount, MAX_LOCKOUT_MS);
    state.lockoutCount += 1;
    state.failures = 0;
  }
  attempts.set(identifier, state);
}

export function isLockedOut(identifier: string): { locked: boolean; secondsRemaining: number } {
  const state = attempts.get(identifier);
  if (!state || !state.lockedUntil) return { locked: false, secondsRemaining: 0 };
  const remainingMs = state.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    state.lockedUntil = 0;
    attempts.set(identifier, state);
    return { locked: false, secondsRemaining: 0 };
  }
  return { locked: true, secondsRemaining: Math.ceil(remainingMs / 1000) };
}

export function resetAttempts(identifier: string): void {
  attempts.delete(identifier);
}

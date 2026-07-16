/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUTH-3 — one shared, auditable authorization gate for privileged actions.
 *
 * Replaces the scattered `window.prompt() + hash compare` gates. Every gate now
 * goes through requireAuth(), which:
 *   1. checks the operator's role against an EXPLICIT per-action allow-list,
 *   2. makes them confirm with THEIR OWN credential (never a shared master PIN),
 *   3. offers a supervisor override when they're not permitted,
 *   4. writes an audit row for every outcome.
 *
 * Why allow-lists and not a linear rank: clinical seniority is NOT financial
 * authority. A veterinarian outranks a cashier clinically, but has no business
 * adjusting the cash drawer. A single ordered hierarchy cannot express that
 * without over-granting, so each action names exactly who may perform it.
 */
import { db } from './localDb';
import { User, AuthAudit } from '../types';

export type ActionRole = 'cashier' | 'veterinarian' | 'manager' | 'owner' | 'admin';

export type AuthAction =
  | 'delete_inventory'
  | 'delete_medical_record'
  | 'void_invoice'
  | 'discount_override'
  | 'cash_adjustment'
  | 'system_restore'
  | 'delete_client_or_pet'
  | 'wipe_cloud_database'
  | 'erase_local_database';

export interface ActionPolicy {
  /** Used verbatim in the prompt: "…to void an invoice". */
  description: string;
  /** Exactly who may perform this. 'admin' is implicit — see isRoleAllowed. */
  allowedRoles: ActionRole[];
}

/**
 * THE single source of truth for who can do what.
 * AUTH-4 (Provider/Owner/Staff) and the admin-editable matrix replace the
 * VALUES here — the call sites and the gate logic stay untouched.
 */
export const ACTION_POLICIES: Record<AuthAction, ActionPolicy> = {
  delete_inventory:      { description: 'delete an inventory item',            allowedRoles: ['owner', 'manager'] },
  delete_medical_record: { description: 'delete a medical record',             allowedRoles: ['owner', 'manager', 'veterinarian'] },
  void_invoice:          { description: 'void an invoice',                     allowedRoles: ['owner', 'manager'] },
  discount_override:     { description: 'approve an over-threshold discount',  allowedRoles: ['owner', 'manager'] },
  cash_adjustment:       { description: 'adjust the cash drawer',              allowedRoles: ['cashier', 'owner', 'manager'] },
  system_restore:        { description: 'restore the system from a backup',    allowedRoles: [] },
  delete_client_or_pet:  { description: 'delete a client or pet',              allowedRoles: ['owner', 'manager'] },
  wipe_cloud_database:   { description: 'wipe the cloud database',             allowedRoles: [] },
  erase_local_database:  { description: 'erase the local database',            allowedRoles: [] },
};

export interface AuthResult {
  allowed: boolean;
  /** User.id of whoever ultimately authorized this. */
  approvedBy?: string;
  /** True when a supervisor stepped in for an operator below the allow-list. */
  isOverride: boolean;
}

/**
 * 'admin' is the system provider (Ash Point Solutions) and is deliberately
 * permitted everywhere — this is an explicit product decision, not the
 * accidental `if (role === 'admin') return true` that used to sit in
 * isViewPermitted. Actions with an empty allowedRoles list are admin-ONLY.
 */
export function isRoleAllowed(role: string | undefined, action: AuthAction): boolean {
  if (role === 'admin') return true;
  if (!role) return false;
  return ACTION_POLICIES[action].allowedRoles.includes(role as ActionRole);
}

/** Everyone who could authorize this action — used to word the override prompt. */
export function authorizedRolesFor(action: AuthAction): string[] {
  return [...ACTION_POLICIES[action].allowedRoles, 'admin'];
}

// ---------------------------------------------------------------------------
// Host bridge — lets this module drive a React modal without importing React.
// ---------------------------------------------------------------------------

export interface AuthPromptRequest {
  mode: 'confirm' | 'override';
  action: AuthAction;
  actionDescription: string;
  /** Operator at the keyboard. */
  currentUser: User;
  /** Roles that may authorize (override mode only). */
  authorizedRoles: string[];
}

/** Resolves with the entered credential, or null when the operator cancels. */
export type AuthPromptFn = (req: AuthPromptRequest) => Promise<{ username: string; credential: string } | null>;

/** Verifies a username's credential. Supplied by App, which owns systemConfig. */
export type CredentialCheckFn = (
  username: string,
  credential: string
) => Promise<{ valid: boolean; user: User | null }>;

let promptFn: AuthPromptFn | null = null;
let checkFn: CredentialCheckFn | null = null;

export function registerAuthBridge(prompt: AuthPromptFn, check: CredentialCheckFn): void {
  promptFn = prompt;
  checkFn = check;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function writeAudit(row: Omit<AuthAudit, 'id' | 'timestamp' | 'created_at' | 'updated_at'>): Promise<void> {
  try {
    const now = new Date().toISOString();
    const entry: AuthAudit = { id: crypto.randomUUID(), timestamp: now, created_at: now, updated_at: now, ...row };
    await db.authAudit.setItem(entry.id, entry);
  } catch (err) {
    // Never let auditing break the action itself — but do surface it.
    console.error('[requireAuth] Failed to write audit row:', err);
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Authorize `action` for `currentUser`. Always prompts for a credential — being
 * permitted is not the same as having proven you are still at the keyboard.
 */
export async function requireAuth(currentUser: User | null, action: AuthAction): Promise<AuthResult> {
  const policy = ACTION_POLICIES[action];
  const denied: AuthResult = { allowed: false, isOverride: false };

  if (!currentUser) return denied;
  if (!promptFn || !checkFn) {
    console.error('[requireAuth] Auth bridge not registered — denying by default.');
    return denied;
  }

  const base = {
    action,
    action_description: policy.description,
    attempted_by: currentUser.id,
    attempted_by_name: currentUser.name,
    attempted_by_role: currentUser.role,
  };

  const permitted = isRoleAllowed(currentUser.role, action);
  const mode: 'confirm' | 'override' = permitted ? 'confirm' : 'override';

  const answer = await promptFn({
    mode,
    action,
    actionDescription: policy.description,
    currentUser,
    authorizedRoles: authorizedRolesFor(action),
  });

  if (!answer) {
    await writeAudit({ ...base, allowed: false, is_override: false, reason: 'cancelled' });
    return denied;
  }

  // --- Path A: the operator is permitted — confirm their OWN credential. -----
  if (permitted) {
    const { valid } = await checkFn(currentUser.username, answer.credential);
    if (!valid) {
      await writeAudit({ ...base, allowed: false, is_override: false, reason: 'bad_credential' });
      return denied;
    }
    await writeAudit({
      ...base, allowed: true, is_override: false, reason: 'granted',
      approved_by: currentUser.id, approved_by_name: currentUser.name, approved_by_role: currentUser.role,
    });
    return { allowed: true, approvedBy: currentUser.id, isOverride: false };
  }

  // --- Path B: not permitted — a supervisor may approve on the spot. ---------
  const { valid, user: supervisor } = await checkFn(answer.username, answer.credential);
  if (!valid || !supervisor) {
    await writeAudit({ ...base, allowed: false, is_override: true, reason: 'bad_credential' });
    return denied;
  }

  // The supervisor must themselves be permitted, and must be a DIFFERENT account.
  if (supervisor.username === currentUser.username) {
    await writeAudit({ ...base, allowed: false, is_override: true, reason: 'role_denied' });
    return denied;
  }
  if (!isRoleAllowed(supervisor.role, action)) {
    await writeAudit({
      ...base, allowed: false, is_override: true, reason: 'role_denied',
      approved_by: supervisor.id, approved_by_name: supervisor.name, approved_by_role: supervisor.role,
    });
    return denied;
  }

  await writeAudit({
    ...base, allowed: true, is_override: true, reason: 'granted',
    approved_by: supervisor.id, approved_by_name: supervisor.name, approved_by_role: supervisor.role,
  });
  return { allowed: true, approvedBy: supervisor.id, isOverride: true };
}

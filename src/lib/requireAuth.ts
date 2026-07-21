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

export type ActionRole = 'cashier' | 'veterinarian' | 'manager' | 'owner' | 'admin' | 'provider';

export type AuthAction =
  | 'delete_inventory'
  | 'delete_medical_record'
  | 'void_invoice'
  | 'discount_override'
  | 'cash_adjustment'
  | 'system_restore'
  | 'delete_client_or_pet'
  | 'wipe_cloud_database'
  | 'erase_local_database'
  | 'change_password'
  | 'manage_staff_logins';

/** Every role the access matrix can toggle. 'provider' is shown but never editable (root). */
export const ALL_ACTION_ROLES: ActionRole[] = ['cashier', 'veterinarian', 'manager', 'owner', 'admin', 'provider'];

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
  change_password:       { description: 'change an account password',          allowedRoles: ['owner', 'manager'] },
  manage_staff_logins:   { description: 'manage staff logins',                 allowedRoles: ['owner'] },
};

// ---------------------------------------------------------------------------
// Runtime overrides (AUTH-4)
// ---------------------------------------------------------------------------
// ACTION_POLICIES above stays the DEFAULT. The admin-editable access matrix
// persists overrides in systemConfig.actionPolicies; App pushes them here on
// load/change. Enforcement semantics are unchanged — only where the allow-list
// is READ from. An action with no override falls back to its default.

let policyOverrides: Partial<Record<AuthAction, ActionRole[]>> = {};

export function setPolicyOverrides(overrides: Partial<Record<AuthAction, ActionRole[]>> | undefined): void {
  policyOverrides = overrides ? { ...overrides } : {};
}

/** The allow-list actually in force for this action right now. */
export function getEffectiveRoles(action: AuthAction): ActionRole[] {
  const override = policyOverrides[action];
  return override ?? ACTION_POLICIES[action].allowedRoles;
}

export interface AuthResult {
  allowed: boolean;
  /** User.id of whoever ultimately authorized this. */
  approvedBy?: string;
  /** True when a supervisor stepped in for an operator below the allow-list. */
  isOverride: boolean;
}

/**
 * PROVIDER-1: 'provider' is the vendor root (Ash Point Solutions) and is now the
 * ONLY role permitted everywhere — driven by ROOT_ROLES below. 'admin' was
 * demoted from god-mode and goes through the normal allow-list like any other
 * role. Actions with an empty allowedRoles list are root-ONLY (provider),
 * reachable by others only via a provider override.
 */
export function isRoleAllowed(role: string | undefined, action: AuthAction): boolean {
  if (ROOT_ROLES.includes(role as any)) return true;
  if (!role) return false;
  return getEffectiveRoles(action).includes(role as ActionRole);
}

/** Everyone who could authorize this action — used to word the override prompt. */
export function authorizedRolesFor(action: AuthAction): string[] {
  return Array.from(new Set([...getEffectiveRoles(action), 'provider']));
}

// ---------------------------------------------------------------------------
// AUTH-6 — Provider tier (identity, not permission)
// ---------------------------------------------------------------------------
// PROVIDER-1: 'provider' is the vendor's root account and the SOLE root. 'admin'
// is no longer universally permitted — only 'provider' bypasses via ROOT_ROLES.
//
// Settings VISIBILITY is a separate question and deliberately NOT part of the
// access matrix: "who is the provider" is an identity fact, not a role
// permission someone can be granted. So these are constants, not config —
// otherwise an admin could edit the matrix to hand themselves vendor surfaces.

export const ROOT_ROLES = ['provider'] as const;

export type SettingsTab = 'profile' | 'pos' | 'inventory' | 'staff' | 'database' | 'rates';

/** Vendor-only Settings surfaces (licensing / secret rotation / db-level config). */
export const PROVIDER_ONLY_TABS: SettingsTab[] = ['database'];

export function isProviderOnlyTab(tab: SettingsTab): boolean {
  return PROVIDER_ONLY_TABS.includes(tab);
}

/** Only 'provider' may see provider-only tabs — admin is explicitly below it. */
export function canViewSettingsTab(role: string | undefined, tab: SettingsTab): boolean {
  if (!isProviderOnlyTab(tab)) return true;
  return role === 'provider';
}

/**
 * Actions whose ONLY trigger UI lives inside a provider-only Settings tab.
 * These are identity-scoped, not role-grantable: showing them as togglable rows
 * would let an admin "grant owner erase_local_database" — a control that could
 * never fire, because owner cannot reach the surface that triggers it. The
 * matrix hides them; enforcement is unchanged (allowedRoles: [] => root only).
 */
export const PROVIDER_ONLY_ACTIONS: AuthAction[] = [
  'system_restore',
  'wipe_cloud_database',
  'erase_local_database',
];

export function isProviderOnlyAction(action: AuthAction): boolean {
  return PROVIDER_ONLY_ACTIONS.includes(action);
}

// ---------------------------------------------------------------------------
// PROVIDER-1 — Panel (view) access matrix
// ---------------------------------------------------------------------------
// Provider chooses which VIEWS each role may open. Enforcement reads
// systemConfig.rolePermissions (App.tsx isViewPermitted) — the SAME place the
// app already reads (HOTFIX-1's lesson). These constants only name the matrix's
// columns and rows. 'provider' is always-on and never editable (root): it is a
// column for display, guarded in BOTH the UI and the toggle handler.

export type PanelRole = 'cashier' | 'veterinarian' | 'manager' | 'owner' | 'admin' | 'groomer' | 'provider';

export const ALL_PANEL_ROLES: PanelRole[] = ['cashier', 'veterinarian', 'manager', 'owner', 'admin', 'groomer', 'provider'];

export interface PanelDef { id: string; label: string; }

/** Grantable views (nav panels). 'settings' is deliberately absent — it is a
 *  provider-identity surface, not a grantable permission. 'reports' folds into
 *  'dashboard' (see App.tsx permissionKey), so it is not a separate row. */
export const PANEL_VIEWS: PanelDef[] = [
  { id: 'dashboard',    label: 'Dashboard & Reports' },
  { id: 'pos',          label: 'POS' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'pets',         label: 'Pets' },
  { id: 'customers',    label: 'Customers' },
  { id: 'vaccinations', label: 'Vaccinations' },
  { id: 'examinations', label: 'Examinations' },
  { id: 'laboratory',   label: 'Laboratory' },
  { id: 'boarding',     label: 'Boarding / Hotel' },
  { id: 'grooming',     label: 'Grooming Salon' },
  { id: 'inventory',    label: 'Inventory' },
  { id: 'invoices',     label: 'Invoices' },
  { id: 'shift',        label: 'Shift & Drawer' },
  { id: 'staff',        label: 'Staff & Payroll' },
];

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
    if (import.meta.env.DEV) console.error('[requireAuth] Failed to write audit row:', err);
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

  if (!currentUser || currentUser.active === false) return denied;
  if (!promptFn || !checkFn) {
    if (import.meta.env.DEV) console.error('[requireAuth] Auth bridge not registered — denying by default.');
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

import { User } from '../types';
import { SystemConfig } from '../components/SystemSettings';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import {
  fetchUsers,
  fetchClinicSettings,
  fetchSystemConfig as dbFetchSystemConfig,
  upsertUser,
  deleteUser as dbDeleteUser,
  upsertSystemConfig as dbUpsertSystemConfig,
} from './db';

// ---------------------------------------------------------------------------
// Supabase Auth (Phase C1)
// ---------------------------------------------------------------------------

/** The current Supabase Auth user, or null when unauthenticated/unconfigured. */
export async function getSupabaseUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/** True when there is an active Supabase Auth session. */
export async function isSupabaseAuthenticated(): Promise<boolean> {
  return (await getSupabaseUser()) !== null;
}

export async function fetchStaffRegistry(): Promise<User[]> {
  return fetchUsers();
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const config = await dbFetchSystemConfig();
  if (!config) throw new Error('Cloud system configuration is missing. Contact an administrator.');
  return config;
}

export async function fetchStaffUsers(): Promise<User[]> {
  return await fetchStaffRegistry();
}

export async function upsertStaffUser(user: User, currentUser: User): Promise<void> {
  if (!currentUser?.isSuperadmin && !['owner', 'manager'].includes(currentUser?.role || '')) {
    throw new Error('Unauthorized: Only a clinic owner or manager can modify staff records.');
  }
  if (!user || !user.id) return;
  await upsertUser(user);
}

export async function deleteStaffUser(userId: string, currentUser: User): Promise<void> {
  if (!currentUser?.isSuperadmin && !['owner', 'manager'].includes(currentUser?.role || '')) {
    throw new Error('Unauthorized: Only a clinic owner or manager can delete staff records.');
  }
  if (!userId) return;
  await dbDeleteUser(userId);
}

export async function upsertSystemConfig(config: SystemConfig, currentUser: User): Promise<void> {
  if (!currentUser?.isSuperadmin) {
    throw new Error('Unauthorized: Only the superadmin can update global configuration.');
  }
  await dbUpsertSystemConfig(config);
}

// ---------------------------------------------------------------------------
// Step 32 — Supabase Auth identity → staff mapping (free-tier login)
// ---------------------------------------------------------------------------

/**
 * Resolve the signed-in Supabase Auth identity to its staff record via
 * public.users.auth_user_id. This is the ONLY authoritative link between an
 * Auth session and app role — never a PIN, sync header, or client-supplied
 * role. The PIN column is column-locked at the DB (see 20260808_free_auth_rls)
 * and is deliberately NOT selected here.
 *
 * Returns null when unconfigured, unauthenticated, or when the identity is not
 * yet linked to an active staff row (OWNER ACTION REQUIRED: set users.auth_user_id
 * for the real staff Auth account). The returned staff record includes its clinic
 * assignment for the root React auth state. A null result must be treated as
 * "no access".
 */
export async function fetchStaffForAuthUser(authUserId: string | null | undefined): Promise<User | null> {
  if (!supabase || !authUserId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, role, avatar_color, active, is_deleted, auth_user_id, clinic_id, is_superadmin')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error || !data) return null;
  const clinicSettings = data.clinic_id
    ? await fetchClinicSettings(data.clinic_id)
    : null;

  return {
    id: data.id,
    name: data.name,
    username: data.username,
    role: data.role,
    avatarColor: data.avatar_color || '',
    active: data.active ?? true,
    clinicId: data.clinic_id ?? null,
    isSuperadmin: data.is_superadmin === true,
    clinicSettings,
  } as User;
}

/** Resolve a Supabase session to the only staff identity the app may trust. */
export async function fetchStaffForSession(session: Session | null | undefined): Promise<User | null> {
  return fetchStaffForAuthUser(session?.user?.id);
}

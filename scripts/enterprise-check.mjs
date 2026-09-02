import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const requireFile = (file) => { if (!existsSync(path.join(root, file))) failures.push('missing required file: ' + file); };
const read = (file) => readFileSync(path.join(root, file), 'utf8');

for (const file of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'supabase/migrations/20260820_role_scoped_rpc_guards.sql',
  'supabase/migrations/20260902_superadmin_control_plane.sql',
  'tests/sql/step33_superadmin_control_plane.test.sql',
]) requireFile(file);
const pkg = JSON.parse(read('package.json'));
if (pkg.scripts?.lint !== 'tsc --noEmit') failures.push('lint script must remain the TypeScript check');
if (typeof pkg.scripts?.build !== 'string') failures.push('build script is missing');
if (typeof pkg.scripts?.['enterprise:check'] !== 'string') failures.push('enterprise:check script is missing');
const roleSql = read('supabase/migrations/20260820_role_scoped_rpc_guards.sql');
if (!/current_staff_role/.test(roleSql)) failures.push('role-scoped SQL guard is missing');
if (!/security definer/i.test(roleSql)) failures.push('role-scoped SQL must use security definer RPCs');
if (!/set search_path\s*=\s*public/i.test(roleSql)) failures.push('security definer RPC must set search_path');
if (!/ROLE_NOT_ALLOWED/.test(roleSql)) failures.push('role-denial checks are missing');
const controlPlaneSql = read('supabase/migrations/20260902_superadmin_control_plane.sql');
if (!/is_current_user_superadmin/.test(controlPlaneSql)) failures.push('superadmin identity boundary is missing');
if (!/system_config_superadmin_update/.test(controlPlaneSql)) failures.push('system_config superadmin write policy is missing');
if (!/users_superadmin_update/.test(controlPlaneSql)) failures.push('users superadmin write policy is missing');
if (failures.length) { console.error(failures.map((message) => 'FAIL: ' + message).join('\n')); process.exit(1); }
console.log('Enterprise checks passed: repository files, build hooks, and role-guard invariants.');

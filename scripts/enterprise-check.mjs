import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
   'supabase/migrations/20260914_boarding_pricing_authority.sql',
   'supabase/migrations/20260914_remediation_shift_authority.sql',
   'supabase/migrations/20260914_remediation_invoice_void_effects.sql',
   'supabase/migrations/20260914_zz_remediation_release_manifest.sql',
  'tests/sql/step33_superadmin_control_plane.test.sql',
   'tests/sql/boarding_pricing_authority.test.sql',
   'tests/sql/remediation_shift_authority.test.sql',
   'tests/sql/remediation_invoice_void_effects.test.sql',
  'tests/sql/remediation_baseline_preflight.sql',
   'tests/sql/remediation_release_manifest.test.sql',
   'api/request-guard.ts',
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
const releaseManifest = read('supabase/migrations/20260914_zz_remediation_release_manifest.sql');
const remediationMigrations = readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.startsWith('20260914_') && file.endsWith('.sql'))
  .sort();
if (remediationMigrations.at(-1) !== '20260914_zz_remediation_release_manifest.sql') {
  failures.push('remediation release manifest must sort after all same-day remediation migrations');
}
if (!/RELEASE_SCHEMA_MISSING/.test(releaseManifest)
  || !/RELEASE_PRIVILEGE_INVALID/.test(releaseManifest)
  || !/RELEASE_INDEX_MISSING/.test(releaseManifest)
  || !/prosecdef/.test(releaseManifest)
  || !/search_path=public/.test(releaseManifest)) {
  failures.push('remediation release manifest is missing a fail-closed schema, privilege, index, or security-attribute assertion');
}
const boardingPricingSql = read('supabase/migrations/20260914_boarding_pricing_authority.sql');
if (!/boarding_pricing_profiles/.test(boardingPricingSql)
  || !/pricingSnapshot/.test(boardingPricingSql)
  || !/jsonb_populate_record\(null::public\.boarding_pricing_profiles/.test(boardingPricingSql)
  || !/late_checkout_cents/.test(boardingPricingSql)
  || !/start_boarding_admission_auth/.test(boardingPricingSql)
  || !/record_boarding_charge_auth/.test(boardingPricingSql)
  || !/settle_boarding_account_auth/.test(boardingPricingSql)
  || !/commit_boarding_cash_ledger_auth\(jsonb, jsonb, jsonb\)/.test(boardingPricingSql)) {
  failures.push('server-authoritative boarding pricing migration is incomplete');
}
const checkoutEffectsSql = read('supabase/migrations/20260914_remediation_checkout_effects.sql');
if (!/update_invoice_customer_auth/.test(checkoutEffectsSql)
  || !/revoke insert, update, delete on public\.invoices from authenticated/.test(checkoutEffectsSql)) {
   failures.push('direct authenticated invoice writes are not closed by the checkout remediation');
}
const shiftAuthoritySql = read('supabase/migrations/20260914_remediation_shift_authority.sql');
if (!/open_shift_auth/.test(shiftAuthoritySql)
  || !/restore_shift_auth/.test(shiftAuthoritySql)
  || !/revoke insert, update, delete on public\.shifts from authenticated/.test(shiftAuthoritySql)) {
  failures.push('direct authenticated shift mutations are not closed by the shift remediation');
}
const voidEffectsSql = read('supabase/migrations/20260914_remediation_invoice_void_effects.sql');
if (!/void_invoice_and_reverse_revenue_auth/.test(voidEffectsSql)
  || !/lifetime_value/.test(voidEffectsSql)
  || !/sources_released/.test(voidEffectsSql)) {
  failures.push('invoice void customer/source effects are not server-owned');
}
const dbSource = read('src/lib/db.ts');
if (/commitBoardingCashLedger/.test(dbSource)) {
  failures.push('legacy browser-authored boarding settlement caller remains in db.ts');
}
if (/\.from\('invoices'\)\.upsert/.test(dbSource)) {
  failures.push('direct browser invoice upsert remains in db.ts');
}
if (!/fetchBoardingPricingProfile[\s\S]*?\.eq\('clinic_id', currentClinicId\)/.test(dbSource)) {
  failures.push('boarding pricing reads are not explicitly scoped to the active clinic');
}
if (/\.from\('shifts'\)\.insert/.test(dbSource)) {
  failures.push('direct browser shift insert remains in db.ts');
}
if (!/BOOT_ROW_LIMIT/.test(dbSource) || !/assertBootRowLimit/.test(dbSource)) {
  failures.push('boot hydration does not have a fail-closed row bound');
}
const groomingSource = read('src/components/GroomingManager.tsx');
if (/innerHTML/.test(groomingSource)) {
  failures.push('grooming consent still contains an innerHTML sink');
}
const requestGuard = read('api/request-guard.ts');
if (!/JSON\.stringify\(req\.body\)/.test(requestGuard)
  || !/buckets\.delete\(bucketKey\)/.test(requestGuard)) {
  failures.push('API body/rate guards do not cover parsed bodies and stale bucket cleanup');
}
if (failures.length) { console.error(failures.map((message) => 'FAIL: ' + message).join('\n')); process.exit(1); }
console.log('Enterprise checks passed: repository files, build hooks, and role-guard invariants.');

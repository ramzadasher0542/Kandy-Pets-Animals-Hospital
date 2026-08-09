/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generate the safe Auth-to-staff linking SQL for a new hospital.
 *
 * Usage:
 *   npx tsx scripts/onboard-new-hospital.ts "Colombo Pet Clinic" \
 *     admin@example.com <supabase-auth-user-uuid>
 *
 * The Auth user must already exist in Supabase Authentication. This script
 * never creates, prints, hashes, or stores a password.
 */

const [hospitalName, email, authUserId] = process.argv.slice(2);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sql = (value: string) => value.replace(/'/g, "''");

if (!hospitalName?.trim() || !email?.trim() || !UUID.test(authUserId ?? '')) {
  console.error(
    '\nUsage: npx tsx scripts/onboard-new-hospital.ts "Hospital Name" admin@example.com <supabase-auth-user-uuid>\n',
  );
  process.exit(1);
}

console.log(`\n-- ${hospitalName.trim()} administrator Auth mapping`);
console.log('-- Create and verify the Auth identity before running this SQL.');
console.log('-- Keep the password in the owner\'s password manager only.');
console.log(`INSERT INTO public.users (id, name, username, role, active, is_deleted, auth_user_id)`);
console.log(`VALUES (gen_random_uuid(), '${sql(hospitalName.trim())} Administrator', '${sql(email.trim())}', 'admin', true, false, '${authUserId}');`);
console.log('\n-- Next: configure Vercel with only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
console.log('-- Then run the release checks in ONBOARDING.md.\n');

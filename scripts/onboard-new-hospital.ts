/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUTH-7 — Onboarding seed script for a NEW hospital deployment.
 *
 *   npx tsx scripts/onboard-new-hospital.ts "Colombo Pet Clinic"
 *
 * Generates a UNIQUE Provider password and a UNIQUE Hospital Owner password for
 * this deployment, prints them ONCE, and emits the SQL to seed both accounts.
 *
 * WHY UNIQUE PER DEPLOYMENT: reusing one Provider password across clients means
 * a single leak compromises every hospital you have ever sold to. Never copy a
 * password between deployments.
 *
 * SECURITY CONTRACT — read before editing this file:
 *   - Passwords come from Node's crypto.randomBytes. Never from a human, never
 *     from an AI suggestion, never a memorable phrase.
 *   - Plaintext is printed to stdout ONCE and written to NO file, ever.
 *   - Only bcrypt hashes go into the SQL. The DB never sees plaintext.
 *   - Do not add a --output flag. Do not log the plaintext. Do not paste it into
 *     a chat, an AI tool, a ticket, or a commit.
 *
 * This script is standalone (scripts/ is outside the app bundle) and performs no
 * network calls — it only prints. You run the SQL yourself.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { hashCredential } from '../src/lib/credentials';

// 'provider' is the vendor root tier defined in AUTH-6 (src/types.ts UserRole).
// It must be exactly this string — requireAuth's ROOT_ROLES checks for it, and
// staff_users.role has no CHECK constraint to catch a typo.
const PROVIDER_ROLE = 'provider';
const OWNER_ROLE = 'owner';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I/O — ambiguous when transcribed
const LOWER = 'abcdefghijkmnopqrstuvwxyz';  // no l
const DIGIT = '23456789';                   // no 0/1
const SYMBOL = '!@#$%^&*()-_=+[]{}:,.?';
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

/**
 * Cryptographically random password, 20 chars, guaranteed to contain at least
 * one of each class. Uses crypto.randomInt (rejection-sampled, unbiased) —
 * NOT Math.random, which is not cryptographically secure.
 */
function generatePassword(length = 20): string {
  if (length < 16) throw new Error('Refusing to generate a password shorter than 16 characters.');
  const chars: string[] = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGIT[randomInt(DIGIT.length)],
    SYMBOL[randomInt(SYMBOL.length)],
  ];
  while (chars.length < length) chars.push(ALL[randomInt(ALL.length)]);

  // Fisher-Yates with crypto randomness, so the guaranteed classes aren't
  // pinned to predictable positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** A UUID for the seeded rows (staff_users.id is UUID). */
function uuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Single-quote escaping for SQL string literals. */
const sql = (v: string) => v.replace(/'/g, "''");

async function main() {
  const hospitalName = process.argv[2];
  if (!hospitalName || !hospitalName.trim()) {
    console.error('\nUsage: npx tsx scripts/onboard-new-hospital.ts "<Hospital Name>"\n');
    process.exit(1);
  }

  const providerPassword = generatePassword();
  const ownerPassword = generatePassword();

  if (providerPassword === ownerPassword) {
    // Astronomically unlikely; fail loudly rather than ship a shared credential.
    throw new Error('Generated identical passwords — aborting. Re-run.');
  }

  const providerHash = await hashCredential(providerPassword);
  const ownerHash = await hashCredential(ownerPassword);

  const providerId = uuid();
  const ownerId = uuid();
  const providerUsername = 'provider_root';
  const ownerUsername = 'hospital_owner';

  const line = '='.repeat(78);
  console.log(`\n${line}`);
  console.log(`  ONBOARDING — ${hospitalName.trim()}`);
  console.log(line);
  console.log('\n  ⚠️  SAVE THESE NOW — they will not be shown again.');
  console.log('     Do not paste these into any chat, AI tool, or ticket.');
  console.log('     Put each one straight into a password manager, then clear your terminal.\n');
  console.log(`  PROVIDER  (vendor root — YOU keep this, never give it to the hospital)`);
  console.log(`    username: ${providerUsername}`);
  console.log(`    password: ${providerPassword}\n`);
  console.log(`  HOSPITAL OWNER  (hand to the client via a SEPARATE channel)`);
  console.log(`    username: ${ownerUsername}`);
  console.log(`    password: ${ownerPassword}\n`);
  console.log(line);
  console.log('  SQL — run this against the NEW hospital\'s Supabase project');
  console.log('  (only bcrypt hashes below; the plaintext above is never stored)');
  console.log(`${line}\n`);

  console.log(`INSERT INTO staff_users ("id","name","username","role","avatarColor","pin","active")
VALUES
  ('${providerId}', 'Provider Root', '${sql(providerUsername)}', '${PROVIDER_ROLE}',
   'bg-slate-900 text-white border-slate-700', '${sql(providerHash)}', true),
  ('${ownerId}', '${sql(hospitalName.trim())} Owner', '${sql(ownerUsername)}', '${OWNER_ROLE}',
   'bg-indigo-100 text-indigo-700 border-indigo-200', '${sql(ownerHash)}', true);
`);

  console.log(`${line}`);
  console.log('  NEXT: see ONBOARDING.md — set the sync secret, .env, then package.');
  console.log(`${line}\n`);
}

main().catch((err) => {
  console.error('\nOnboarding failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

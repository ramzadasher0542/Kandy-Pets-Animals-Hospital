import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const read = (file) => readFileSync(path.join(root, file), 'utf8');

for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'supabase/migrations/20260820_role_scoped_rpc_guards.sql']) {
  check(existsSync(path.join(root, file)), 'missing required file: ' + file);
}

const packageJson = JSON.parse(read('package.json'));
check(packageJson.scripts?.lint === 'tsc --noEmit', 'lint script must remain the TypeScript check');
check(typeof packageJson.scripts?.build === 'string', 'build script is missing');
check(typeof packageJson.scripts?.['enterprise:check'] === 'string', 'enterprise:check script is missing');

const roleSql = read('supabase/migrations/20260820_role_scoped_rpc_guards.sql');
check(/current_staff_role/.test(roleSql), 'role-scoped SQL guard is missing');
check(/security definer/i.test(roleSql), 'role-scoped SQL must use security definer RPCs');
check(/set search_path\s*=\s*public/i.test(roleSql), 'security definer RPC must set search_path');
check(/ROLE_NOT_ALLOWED/.test(roleSql), 'role-denial checks are missing');

const forbiddenTrackedNames = /(^|\/)(\.env(?:\..*)?|.*\.(pem|key))$/i;
const secretPattern = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{10,}/;
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (entry.isDirectory()) walk(full);
    else if (!forbiddenTrackedNames.test(relative) && statSync(full).size < 1000000) {
      check(!secretPattern.test(readFileSync(full, 'utf8')), 'possible private secret in ' + relative);
    }
  }
};
walk(root);

if (failures.length) {
  console.error(failures.map((message) => 'FAIL: ' + message).join('\n'));
  process.exit(1);
}
console.log('Enterprise checks passed: repository hygiene, build hooks, and role-guard invariants.');


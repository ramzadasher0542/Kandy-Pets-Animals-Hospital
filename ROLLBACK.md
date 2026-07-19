# ROLLBACK — PROVIDER-1 (provider becomes root, admin demoted)

Written **before** demoting admin, in case the provider account can't log in and
you get locked out of Settings / Data & Operations.

## First: you should NOT be locked out
- `ashpoint_owner` is now synthesised as role **`provider`** (the new sole root).
- Its password is unchanged in code: the default `masterPin = hashPin('5692')`
  (App.tsx). So **log in as `ashpoint_owner` with PIN `5692`** → you are provider
  → you see everything, including Data & Operations and both access matrices.
- The strong 20-char provider password was printed once to the terminal during
  this task. It is NOT applied automatically (Option A) — the code default stays
  `5692` so the 17 tests pass. There is currently **no in-app UI to change the
  provider/masterPin password** (flagged in the report).

## If provider login is broken — revert these exact changes
All edits are uncommitted. Either `git checkout -- <file>` each file, or hand-edit:

1. **src/lib/requireAuth.ts**
   - `export const ROOT_ROLES = ['provider'] as const;`  → back to `['admin', 'provider']`
   - `ActionRole` and `ALL_ACTION_ROLES`: remove the added `'provider'`
   - `authorizedRolesFor`: `'provider'` → back to `'admin'`
   - Remove the added `PanelRole` / `ALL_PANEL_ROLES` / `PANEL_VIEWS` constants
2. **src/App.tsx**
   - The two `ashpoint_owner` login literals: `role: 'provider'` → back to `role: 'admin'`
     (also `name: \`${systemConfig.appName} Provider\`` → `... Admin` if you want)
   - `rolePermissions` initial block + merge-backfill: remove the added `groomer`/`provider` keys
3. **src/components/DashboardAnalytics.tsx**
   - `canSeeFinancials`: remove the added `currentUser?.role === 'provider'`
4. **src/components/SystemSettings.tsx**
   - Action matrix: `role === 'provider'` guards → back to `role === 'admin'`; `isProvider` → `isAdmin`
   - `SystemConfig.rolePermissions` type: back to `{ cashier, veterinarian, admin, owner }`
   - Remove the new Panel Access Matrix block + `togglePanel`/`effectivePanelsFor` + the requireAuth import additions

Reverting requireAuth.ts (`ROOT_ROLES` back to `['admin','provider']`) alone restores
admin god-mode, which is the fastest way back in if needed.

## Emergency floor
Even with everything reverted, `ashpoint_owner` / `5692` is admin-root again and
can reach Settings. Nothing here changes that fallback.

# FIX — Provider Password Change Should Not Ask for PIN Again

## CONTEXT
- SystemSettings.tsx handleChangePassword calls requireAuth before changing password
- For provider changing their own password, this is redundant and confusing
- The provider is already authenticated (they're logged in)

## WHAT TO DO
In src/components/SystemSettings.tsx:
1. In handleChangePassword, BEFORE calling requireAuth, check if pwTarget is the provider
2. If provider is changing their own password, SKIP requireAuth
3. Only call requireAuth for staff/owner password changes

## CODE CHANGE
Change:
  const auth = await requireAuth(currentUser || null, 'change_password');
  if (!auth.allowed) { showToast('Authorization failed...'); return; }

To:
  const isProviderSelf = (pwTarget as any)?.__isProvider || pwTarget?.username === 'ashpoint_owner';
  if (!isProviderSelf) {
    const auth = await requireAuth(currentUser || null, 'change_password');
    if (!auth.allowed) { showToast('Authorization failed. Password unchanged.', 'error'); return; }
  }
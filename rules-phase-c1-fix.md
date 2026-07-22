# PHASE C1 FIX — Correct Email + Wire signOut

## CONTEXT
- Supabase provider user email: ramzadasher0542@gmail.com
- Current code hardcodes: provider@ashpointsolutions.com (WRONG)
- signOut() is exported but NOT called when user clicks Sign Out

## FIX 1: Correct the hardcoded email
In src/App.tsx, find:
  await signInWithPassword('provider@ashpointsolutions.com', enteredPin);
Change to:
  await signInWithPassword('ramzadasher0542@gmail.com', enteredPin);

## FIX 2: Wire signOut to Sign Out button
In src/App.tsx, find the Sign Out button onClick handler (search for "Sign Out" or "setCurrentUser(null)").
Before the line that clears local state (setCurrentUser(null)), add:
  await signOut();

## CONSTRAINTS
1. DO NOT change any other auth logic
2. DO NOT remove local sign-out (keep setCurrentUser(null))
3. Run npx tsc --noEmit
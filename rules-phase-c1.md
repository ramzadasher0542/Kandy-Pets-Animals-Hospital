# \# PHASE C1 — Enable Supabase Auth + Dual Login

# 

# \## CONTEXT

# \- Supabase Auth is now enabled in the dashboard

# \- Provider user created with UUID: \[dc76437f-879c-416a-bf36-cd5e0d0e37f4]

# \- Goal: Login flow tries Supabase Auth first, falls back to local auth

# 

# \## WHAT TO DO

# 

# \### In src/lib/supabase.ts:

# 1\. Export a function `signInWithPassword(email: string, password: string)` that calls:

# &#x20;  `supabase.auth.signInWithPassword({ email, password })`

# 2\. Export a function `signOut()` that calls:

# &#x20;  `supabase.auth.signOut()`

# 

# \### In src/App.tsx:

# 1\. In handlePinSubmit (the login handler):

# &#x20;  - FIRST, try Supabase Auth:

# &#x20;    const { data, error } = await signInWithPassword('provider@ashpointsolutions.com', enteredPin);

# &#x20;    if (data.user) {

# &#x20;      // Supabase login succeeded

# &#x20;      setCurrentUser({ ...providerUserObject... });

# &#x20;      return;

# &#x20;    }

# &#x20;  - If Supabase fails, FALL BACK to existing local auth:

# &#x20;    // existing checkCredential logic

# 2\. Keep ALL existing local auth logic as fallback

# 3\. Add a `useEffect` that listens to Supabase auth state changes:

# &#x20;  supabase.auth.onAuthStateChange((event, session) =\&gt; {

# &#x20;    if (event === 'SIGNED\_IN') {

# &#x20;      // User logged in via Supabase

# &#x20;    }

# &#x20;    if (event === 'SIGNED\_OUT') {

# &#x20;      // User logged out

# &#x20;    }

# &#x20;  });

# 

# \### In src/lib/auth.ts:

# 1\. Add a function `getSupabaseUser()` that returns the current Supabase auth user

# 2\. Add a function `isSupabaseAuthenticated()` that returns boolean

# 

# \## CONSTRAINTS

# 1\. DO NOT remove existing local auth

# 2\. DO NOT change requireAuth

# 3\. DO NOT change staff login yet (only provider for now)

# 4\. Run npx tsc --noEmit

# 5\. Test: 5692 should still work (local fallback)


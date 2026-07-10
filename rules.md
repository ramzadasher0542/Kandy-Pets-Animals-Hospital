# Kandy Pets VHMS — session rules

One task per session — only what I describe below. See something else broken? Write it under "Noticed, not fixed" at the end. Do not fix it.

Read the real current file before editing. Do not assume from memory. If the file doesn't match what I described, STOP — tell me exactly what you found and wait. Do not guess or "helpfully" fix something that isn't broken the way I described.

Never invent a function name, import, npm package, env var, DB column, or table that doesn't already exist in this repo. Ask instead of inventing.

Only touch files I name explicitly. If you're changing a function name or signature, grep the whole repo for every call site first, update all of them in the same pass, and list every file you changed.

Never touch git history. Never force-push. Never run git reset --hard unless explicitly told to.

You have Supabase MCP access. Print the exact SQL before running it. CREATE TABLE and ALTER TABLE ADD COLUMN don't need my approval first. DROP TABLE, DROP COLUMN, DELETE, and TRUNCATE on real data always need my explicit approval before running — stop and ask.

Never write a real secret into any committed file. Placeholder in the file, real value only in the live MCP execution.

After every code change: run npx tsc --noEmit and paste the full output. Fix any new type errors before finishing. Do not leave them for me to find.

Verify by actually doing it — start the dev server, run Playwright headless Chromium, perform the real action, read the real result. Do not reason that something "should work" and call it verified. If a check partially fails, say "partially failed, here is exactly what happened" — do not round it up to done.

End every response with:
(a) plain-English list of what changed and in which files
(b) one sentence on how to manually verify it
(c) "Noticed, not fixed" list — even if empty

Be brutally honest in all self-checks. Report what you actually observed, not what you expected.

Confirm you understand these rules, then do the task.

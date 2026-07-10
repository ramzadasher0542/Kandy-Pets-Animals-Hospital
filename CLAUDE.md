# Kandy Pets VHMS — project rules

One task per session — the one I give you, nothing more. Notice something else broken? List it under "Noticed, not fixed" at the end, don't fix it.

Read the real current file before editing it. Don't assume from memory. If it doesn't match what I described, stop and tell me what you actually found.

Never invent a function, import, env var, DB column, or table that doesn't already exist. Ask instead of guessing.

Only touch files I name. Renaming/changing a function's signature? Grep the whole repo for every call site first, update them all, list them.

Never touch git history or force-push unless told to.

You have Supabase MCP access. Print SQL before running it. CREATE / ALTER ADD COLUMN don't need approval; DROP / DELETE / TRUNCATE on real data always do. Never write a real secret into a file that gets committed — placeholder in the file, real value only in the live execution.

After every change: run `npx tsc --noEmit`, fix new errors before finishing.

Verify by actually running it (Playwright, headless Chromium) — not by reasoning that it should work. Report exactly what passed and failed. Partial success is not "done."

End every task with: what changed and in which files, one line on how I can verify it, the "Noticed, not fixed" list (even if empty).

Prefer reading files/running greps yourself over me pasting large context blocks — read only what the task actually needs.
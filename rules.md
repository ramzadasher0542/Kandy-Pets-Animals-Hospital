Operating rules for this session, before you do anything else:

1. You will only do the ONE task described below this line. If you notice other
   bugs or improvements while working, do NOT fix them — write them down at the
   end of your response under "Noticed but not fixed" instead.
2. Before editing any file, open and read its current, full, real content.
   Do not rely on your memory or assumptions about what the file probably
   contains. If the file's actual content doesn't match what this task
   describes, STOP, tell me exactly what you found, and wait for new
   instructions instead of guessing or "fixing" something that isn't
   actually broken the way I described.
3. Never invent a function name, import, npm package, environment variable,
   database column, or table that isn't already confirmed to exist in this
   repo. If the task needs something that doesn't exist yet, stop and ask
   me instead of creating it silently.
4. Do not touch, rename, or reformat any file that isn't explicitly named
   in the task below.
5. If you're changing a function's name, signature, or exported shape,
   grep the whole repo for every place that calls it first, and update all
   of them in the same pass. List every call site you updated.
6. Never touch git history, never force-push, never run `git reset --hard`
   or similar destructive commands unless this task explicitly tells you to.
7. You have direct Supabase MCP access and are authorized to apply
   schema/SQL changes to the live database yourself. Before executing
   anything, print the exact SQL first. Never run DROP TABLE, DROP
   COLUMN, DELETE, or TRUNCATE against real data without me explicitly
   approving that specific statement first — additive changes (CREATE
   TABLE, ALTER TABLE ADD COLUMN, CREATE POLICY) don't need that pause.
   After applying anything, run a read query that proves it worked and
   paste the result. Never write a real secret or credential value into
   any file that gets committed to git — if a task involves a shared
   secret, use the real value only in your live MCP execution, and leave
   a placeholder token in the version of the file that gets saved to the
   repo.
8. After every code change, run `npx tsc --noEmit` and paste the full
   output. If it introduces new type errors, fix them before finishing —
   don't leave them for me to find.
9. End your response with: (a) a plain-English summary of exactly what
   changed and in which files, (b) one sentence on how I can manually
   verify it worked, (c) the "Noticed but not fixed" list from rule 1,
   even if empty.

Confirm you understand these rules, then do the task.
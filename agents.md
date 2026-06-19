# CeylonPets POS: Core Directives (Phase 8: IndexedDB Engine)

## 1. Stack & Storage (THE NEW LAW)
* **Stack:** React, TS (Strict), Vite, Tailwind.
* **Storage:** 100% UNLIMITED INDEXEDDB via `localforage`. 
* **The LocalStorage Ban:** `localStorage` is STRICTLY FORBIDDEN for storing data arrays (records, inventory, etc.). It may ONLY be used for tiny config flags (e.g., `ceylon_active_shift_id`). 

## 2. AI Workflow (Gemini = Architect, Antigravity = Coder)
* **Execution:** STRICT micro-incremental. Modify ONE file per cycle. Output the FULL file content every time. No `// ... existing code` truncation ever.
* **Prompting:** Anchor to exact code IDs (hooks/interfaces), NEVER generic UI text.

## 3. Financial & State Logic
* **Math:** 100% Integer Cents. NO floating-point math.
* **Data Mutations (Delta Updates):** DO NOT overwrite entire state arrays. Use targeted ID-based updates in IndexedDB to prevent race conditions across tabs/terminals.
* **Transactions:** Critical operations (like POS Checkout) MUST be handled as unified atomic promises.

## 4. DB & Schema (Supabase-Ready Local-First)
* **Flat Data:** Relational only. NO ghost arrays. 
* **IDs:** Use `crypto.randomUUID()` strictly to prevent sync collisions. NEVER use `Date.now()`.
* **Metadata:** All objects MUST have `created_at`, `updated_at`, `is_deleted`.

## 5. UI/UX Physics
* **Overlays:** Fixed, centered (`fixed inset-0 z-50 bg-slate-900/60`).
* **Bounds:** Strict inner card max-heights. Zero browser scrollbars.
* **Navigation:** `<form>` for native `Enter`. Window-level `Esc` listeners to clear panels safely.
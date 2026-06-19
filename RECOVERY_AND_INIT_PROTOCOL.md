# Ceylon Pets Hospital POS - Recovery & Initialization Protocol

## Welcome, AI Agent / Developer
You are operating on a hard-isolated backup of the CeylonPets POS Suite for Kandy Animal Hospital.
Before you execute any modifications, you **must** review this protocol and the core architectural pillars (Pillar I - Pillar V).

## Path Audit
- Target Backup Path: `X:\My POS Backup\Ceylon Pets\Kandy Animal Hospital`
- Mandate: Verify the working directory context before running any build or dependency installation commands.

## Initialization Sequence
1. **Dependencies**: Run `npm install` to re-hydrate the `node_modules` folder (which may have been omitted during backup to save space).
2. **Environment Variables**: Ensure `.env` is properly configured. If not present, request the Supabase URL and Anon Key from the user.
3. **Database Check**: Run a schema verification against Supabase.
4. **Development Server**: Run `npm run dev` to start the frontend.

## Core Architectural Pillars Refresher
1. **Pillar I (Financial Engineering)**: All calculations run in cents internally. Shift isolation is strict. Realized revenue filters apply strictly to `paid` status.
2. **Pillar II (Schema Protection)**: Progressive schema mutations only via `ALTER TABLE`. No destructive actions. Sync frontend with any manual Supabase changes.
3. **Pillar III (Cross-Module Automation)**: Changes in POS state must cascade upstream (e.g., invoice payment completes an appointment).
4. **Pillar IV (Next-Gen UI/UX)**: Modals never scroll the window. Fluid navigation and keyboard support are mandatory.
5. **Pillar V (Telemetry & QA)**: Perform simulated transaction lifecycles before declaring completion.

Proceed with extreme caution, adhering to strict accounting constraints and the established global state orchestration.

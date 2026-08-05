# CeylonPets VHMS — Veterinary Hospital Management System

Built by **ASH POINT SOLUTIONS** for veterinary clinics in Sri Lanka.

CeylonPets VHMS is an offline-first management suite that runs a small animal
hospital end to end — front-desk billing, clinical records, and back-office
inventory in one place. It works fully offline on the local device and
transparently syncs to the cloud when a connection is available, so the front
desk never stops during a network drop.

**Live demo:** https://kpah-aps.vercel.app/

## Features

- **POS register** — fast counter billing with cash/card/bank-transfer tender and shift reconciliation
- **Inventory** — stock control with FEFO batch tracking (lot numbers + expiry dates)
- **Appointments** — booking, check-in, and a live clinic queue
- **Medical records** — per-patient visit history and clinical notes
- **Boarding** — kennel stays with automated per-day rate billing
- **Grooming** — service logs tied to each pet
- **Laboratory** — diagnostic tests with configurable reference-range parameters
- **Vaccinations** — vaccine schedules and history per patient
- **Staff management** — role-based access control and per-user permissions
- **Reports & backup** — clinic KPIs plus one-click full data export

## Tech Stack

- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS** for the UI
- **Supabase** (Postgres) for cloud sync
- **localForage** (IndexedDB) for the offline-first local vault

## Getting Started

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file in the project root with your Supabase credentials:
   ```bash
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   # optional: header checked by RLS write policies
   VITE_SUPABASE_SYNC_SECRET=your-sync-secret
   ```
   > Sync is optional. With no credentials the app runs fully offline against the local IndexedDB vault.
3. Start the dev server:
   ```bash
   npm run dev
   ```

### Other scripts

- `npm run build` — production build
- `npm run preview` — preview the production build locally
- `npm run lint` — type-check with `tsc --noEmit`

## Deployment

The app deploys as a static front end on **Vercel**, backed by a **Supabase**
project for cloud sync and persistence. Set the same `VITE_SUPABASE_*`
environment variables in your Vercel project settings, then build with
`npm run build`.

## License

Licensed under the **Apache-2.0** license, consistent with the SPDX headers
throughout the source.

---

© ASH POINT SOLUTIONS

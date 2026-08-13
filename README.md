# CeylonPets VHMS — Veterinary Hospital Management System

Built by **ASH POINT SOLUTIONS** for veterinary clinics in Sri Lanka.

CeylonPets VHMS is a cloud-backed beta management suite for small animal
hospitals — front-desk billing, clinical records, and back-office inventory in
one place. It uses Supabase Auth, Postgres, and RLS for authenticated cloud
access. The browser does not fall back to a local clinical database when cloud
data is unavailable.

> **Beta / under development:** Do not use this release as the sole system of
> record for real clinic data until the controlled recovery, second-device, and
> end-to-end data tests are complete. Payroll remains deferred.

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
- **Reports & backup** — clinic KPIs plus versioned full JSON export and protected beta restore

## Tech Stack

- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS** for the UI
- **Supabase** (Postgres) for cloud sync

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
    ```
     > Authenticated Supabase access is required for the cloud application.
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
project for Auth, RLS, cloud sync, and persistence. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`
environment variables in your Vercel project settings, then build with
`npm run build`.

## License

Licensed under the **Apache-2.0** license, consistent with the SPDX headers
throughout the source.

---

© ASH POINT SOLUTIONS

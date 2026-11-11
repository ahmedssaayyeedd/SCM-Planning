# PharmaPlan — production planning & Gantt for pharma

React + TypeScript + Vite front end, Supabase (Postgres + Auth) back end, deployed on Vercel.
Data model and seed come from `Pharma_SupplyChain_DB_v10.xlsx`.

## What it does
- **Gantt planner** – factories → orders → 5 phases (procurement, manufacturing, QC, QA release, delivery). Drag bars, resize phases, finish-to-start dependencies (successors are pushed), today line, GMP-expiry milestones, day/week/month zoom.
- **Backward scheduling** from each agreed delivery date with a safety buffer; procurement duration is lengthened automatically when a BOM item has a longer supplier lead time; phases are compressed proportionally when the order window is too short.
- **MRP** – BOM explosion, stock netting in due-date order, lead-time offset to an "order by" date, cost from the cheapest active quote, CSV export.
- **Finite-capacity leveling** per factory (priority, then earliest due date) + weekly load heat-map.
- **Float / health** per order (on track · at risk · late) and earliest-feasible-delivery check.
- Risk register with 5×5 matrix, regulatory expiry watch-list, planning parameters.

## Run it (demo mode, no backend)
```bash
npm install
npm run dev
```
Without env vars the app runs in **demo mode**: data is seeded from the Excel file into your browser's localStorage.

## Connect Supabase
1. Create a Supabase project. In **SQL Editor** run `supabase/schema.sql`, then `supabase/seed.sql`.
2. Authentication → enable Email provider (disable "confirm email" for quick testing).
3. `cp .env.example .env.local` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. `npm run dev` — sign up, then sign in. The Gantt phases are generated on first load.

RLS is enabled: any *authenticated* user can read/write. Tighten the policies in `schema.sql` (e.g. by role) before production.

## Deploy on Vercel
Push to GitHub → Import in Vercel (Vite is auto-detected; `vercel.json` adds the SPA rewrite) → add the two env vars → Deploy.

### Publish from VS Code
Open this project folder, then run **Terminal → Run Task → Publish to GitHub** and enter a commit message. The task stages and publishes project changes to the `main` branch. Review `git status` first, and never commit credentials or environment files. Use **Publish to GitHub (replace remote main)** only when you intentionally want to replace the remote branch history.

## Re-generate seed from a newer workbook
```bash
pip install pandas openpyxl
python scripts/export_seed.py path/to/Pharma_SupplyChain_DB_vNN.xlsx
```
Writes `src/data/seed.json` and `supabase/seed.sql`.

## Notes / assumptions
- The workbook holds only 2 manufacturing orders, so `MO-2026-003…009` are **demo orders** (notes = `demo (planned)`) to make the Gantt meaningful. Delete them in Orders.
- Lead times, factory capacity and phase durations are not in the workbook → defaults in *Master data → Planning parameters* (30/14/10/5/3 workdays, 5-day buffer, 1 parallel order per factory). Calibrate them.
- Work week is Sun–Thu (Fri–Sat off); set "Working days / week" to 6 for Fri-only.
- Stock = Items Master "In stock (kg)"; blank = 0.
- `src/lib/scheduling.ts` is pure and unit-testable; `scripts/typecheck-lib.sh` checks it standalone.

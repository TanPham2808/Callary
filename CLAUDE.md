# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Callary is an internal website for a restaurant to manage flower quantities for wedding decoration
packages, replacing an Excel-based workflow. It's a small full-stack app: Express + better-sqlite3 API,
React + Vite client, single SQLite file as the only datastore. All UI copy, comments, and commit
messages are in Vietnamese — match that when editing existing files.

## Commands

```bash
npm run dev            # server (tsx watch, :3001) + client (vite, :5173) concurrently, with API proxy
npm run dev:server      # server only
npm run dev:client      # client only
npm run build           # vite build -> dist/
npm start               # run server from source, serving dist/ if it exists (single port :3001)
npm run typecheck       # tsc --noEmit — there is no separate lint or test script
npm run seed            # import catalog from data/dinh-luong-hoa.xlsx (first-time setup)
npm run seed -- --force # re-import catalog from Excel, wiping old catalog but keeping events/inventory
npm run seed:export     # export current catalog to data/catalog-snapshot.json (used for prod deploys)
```

There is no test suite and no linter configured — `typecheck` is the only automated check; run it after
any TypeScript change.

Data-inspection utilities (not in package.json, run directly):

```bash
npx tsx server/src/seed/verify.ts "TIÊU CHUẨN"       # print imported data for one package, to diff against Excel
npx tsx server/src/seed/list-flowers.ts               # dump all flowers
npx tsx server/src/seed/make-past-events.ts           # seed past-dated events to test the auto-"Đã xong" transition
```

## Architecture

**Two seeding paths feed the same tables, don't confuse them:**
- `seed/import-excel.ts` (`npm run seed`) parses `data/dinh-luong-hoa.xlsx` — the original source of
  truth for the flower/package catalog — including name normalization via `seed/catalog-map.ts`
  (merging typo'd/abbreviated Excel names into canonical flowers + aliases).
- `seed/seed-snapshot.ts` runs automatically on every server boot (called from `index.ts`) and loads
  `data/catalog-snapshot.json` (produced by `npm run seed:export`) *only if the `flowers` table is
  empty*. This is what actually seeds a fresh production disk — it never touches Excel or an existing
  DB with data.

**Everything is one SQLite file** (`data/callary.db`, path overridable via `CALLARY_DB` env var).
`server/src/db.ts` runs `schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) on every boot, then
`addMissingColumns()` — because new columns added after a table already exists on disk need manual
`ALTER TABLE`, schema.sql alone won't add them. When adding a column to an existing table, add both the
DDL in `schema.sql` (for fresh DBs) *and* an `addColumnIfMissing()` call in `db.ts` (for existing ones).

**Auth is homegrown, no library.** `server/src/auth.ts` implements a single-account (not multi-user)
scheme: HMAC-signed session tokens (not JWT), scrypt password hashing, manual cookie parsing. Credentials
live in `settings` (DB), optionally seeded once from `AUTH_USERNAME`/`AUTH_PASSWORD` env vars if no
account exists yet. `SESSION_SECRET` env var is required or the server throws on first sign. All
`/api/*` routes except `/api/auth/*` require a valid session cookie (checked in `index.ts`).

**`services/calc.ts` is the one place demand/purchase math happens** — every screen and every export
sheet calls `computeRequirement()` rather than re-deriving numbers. The formula (see README for the
Vietnamese business explanation):

```
need   = Σ(item_flowers.quantity × event_package_items.quantity × event_packages.quantity
            × table_count if per_table) + Σ event_adjustments.delta
to_buy = max(0, need − inventory stock)                         // in "unit" (đơn vị dùng)
order  = ceil(to_buy / order_factor)                             // in "order_unit" (đơn vị mua), only
                                                                  // rounded up when order_factor > 1
amount = order × price                                           // price is always per order_unit
```
Cancelled events (`status = 'HUY'`) are excluded everywhere. Rows flagged `is_optional` (Excel's "Hoặc
2 HOA HỒNG" alternative lines) are excluded from totals unless `includeOptional` is passed. Events past
their date auto-flip `DU_KIEN`/`DA_CHOT` → `DA_XONG` via `services/event-status.ts`, invoked both at
boot and on every API request (self-throttled to once/day) so it stays correct across midnight.

**Two parallel unit systems per flower**: `unit` (đơn vị dùng, used in package quantities/stock/
adjustments) vs `order_unit`+`order_factor` (đơn vị mua, what the supplier sells and what `price` is
denominated in). A flower with no `order_unit` is purchased in its own `unit` (factor effectively 1).
Don't conflate the two when touching pricing or purchase-quantity code.

**Route → service layering**: `routes/*.ts` handle HTTP concerns only (zod validation via
`parseBody`/`lib/http.ts`'s `ah()` wrapper for async error propagation, `HttpError` subclasses for
4xx); business logic and SQL live in `services/*.ts` or inline in the route for simple CRUD. `export.ts`
routes call `services/excel.ts` (ExcelJS, 4-sheet report) and `services/word.ts` (docx, plain purchase
order for suppliers) which both consume `calc.ts` output.

**Client data flow**: TanStack Query + a thin `lib/api.ts` fetch wrapper against `/api/*` (proxied to
:3001 in dev via `vite.config.ts`, same-origin in prod once `npm run build` output is served from
`dist/`). Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*` (see `tsconfig.json` and
`vite.config.ts` — keep both in sync if you change either). `shared/types.ts` holds types plus Vietnamese
label maps (`STATUS_LABEL`, `CATEGORY_LABEL`, …) used identically by server and client — add new enum
values there, not separately on each side.

**Auth on the client**: `lib/AuthContext.tsx` + `components/ProtectedRoute.tsx` gate all routes except
`/login` (see `App.tsx`); a 401 from `lib/api.ts` should route back to login rather than showing an error
toast.

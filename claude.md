# CLAUDE.md — Cloudnomics Distributor Console

Context for Claude Code working in this repo. Read this before making changes.

## What this is
A guided, Claude-powered quoting platform that lets non-expert resellers build
Palo Alto Networks quotes through a conversation: recommend a firewall, add
implementation / Cortex XDR / managed services, set a markup, white-label the
output, send it to the customer, and create a follow-up calendar reminder.

## Stack
- Frontend: Vue 3 + TypeScript + Vite, Pinia for state (`web/`). Deploys to Vercel.
- Backend: Node.js + Express + TypeScript (`server/`). Deploys to Railway/Render.
- Database: PostgreSQL via `pg`.
- AI: Anthropic Messages API (`claude-sonnet-4-6`) with a local fallback.

## Repo layout
```
web/   src/stores/quote.ts       conversation flow, selection, live totals (client mirror)
       src/pricing.ts            CLIENT mirror of pricing rules (preview only)
       src/components/           chat thread, composer, quote panel, preview, calendar
server/ src/services/pricing.ts  AUTHORITATIVE pricing engine (source of truth)
        src/services/claude.ts   Anthropic recommendation + local fallback
        src/services/pdf.ts      branded quote PDF (PDFKit)
        src/services/mailer.ts   email (Nodemailer; dry-run without SMTP)
        src/services/calendar.ts Google/Outlook/.ics reminders
        src/services/importPricelist.ts  XLSX -> Postgres importer
        src/routes/              auth, pricelist, recommend, quotes, calendar
        db/schema.sql, db/seed.sql, db/PANW_Pricelist.xlsx
```

## Core architecture principles (do not break these)
1. **Claude picks the product; the engine does every number.** The model is only
   called at the recommendation step and must never compute prices.
2. **The browser previews; the server commits.** Steps 3 (add-ons/markup) run
   client-side via `web/src/pricing.ts` for instant preview. The authoritative
   numbers come from `server/src/services/pricing.ts` when a quote is finalized
   via `POST /api/quotes`.
3. **Keep the two pricing implementations in sync.** If you change a rule in
   `server/src/services/pricing.ts`, mirror it in `web/src/pricing.ts`.

## Pricing rules
- Reseller discount: 30% off product SKUs (`RESELLER_DISCOUNT`).
- Implementation: 15% of its product's reseller price (`IMPL_RATE`).
- Managed service: 15% of the subtotal (`MANAGED_RATE`).
- Customer price: reseller total × (1 + markup/100).
- Quote numbers: start at 643555 (`QUOTE_START`), then max+1.

## Pricelist
Real PANW sheet at `server/db/PANW_Pricelist.xlsx`, parsed by
`importPricelist.ts`. Auto-imports on first boot if `products` is empty.
Refresh: `npm --prefix server run import:pricelist [file.xlsx]` (`-- --dry` to preview).
The recommendation/quote flow runs on PA-Series hardware; VM/CN are imported but
not in the default quote path. The sheet is hardware-only — PANW subscriptions
(Threat Prevention, URL Filtering, WildFire, SD-WAN) are not priced in it.

## Real vs stubbed
- Real: Claude recommendation (with fallback), pricing engine, PDF, quote
  numbering, Postgres persistence, calendar links/.ics.
- SMTP email: real if configured, otherwise dry-run (logs payload).
- Stubbed: auth (JWT for any email — replace with Auth0/Supabase), direct
  calendar OAuth event creation (link-based today).

## Commands
- `npm run install:all` — install root + server + web
- `npm run dev` — run API (:4000) + web (:5173) together
- `npm --prefix server run migrate` — schema + seed + auto-import pricelist
- `npm --prefix server run typecheck` / `npm --prefix web run typecheck`
- `npm --prefix server run build` / `npm --prefix web run build`

## Conventions
- TypeScript strict on both ends. Backend is ESM (`"type": "module"`); use `.js`
  in relative import specifiers (e.g. `import { x } from "./config.js"`).
- Don't put secrets in the frontend; the Anthropic key is server-only.
- Run the relevant `typecheck` after edits; both currently pass clean.

## Env (server/.env)
`DATABASE_URL`, `PGSSL`, `ANTHROPIC_API_KEY` (optional → fallback),
`ANTHROPIC_MODEL=claude-sonnet-4-6`, `JWT_SECRET`, `CORS_ORIGIN`, pricing rates,
and optional `SMTP_*`. See `server/.env.example`.
# Cloudnomics Distributor Console

A guided, Claude-powered quoting platform that lets **non-expert resellers** build
accurate Palo Alto Networks quotes through a natural conversation — recommend the
right firewall, layer on implementation / XDR / managed services, set a markup,
white-label the output, send it to the customer, and drop a follow-up reminder on
the calendar.

Full-stack, runnable, and typed end-to-end.

| Layer | Stack |
| --- | --- |
| Frontend | **Vue 3 + TypeScript + Vite** (Pinia state) → deploy to **Vercel** |
| Backend | **Node.js + Express + TypeScript** → deploy to **Railway / Render** |
| Database | **PostgreSQL** (`pg`) |
| AI | Anthropic **Messages API** (`claude-sonnet-4-6`) with a safe local fallback |

---

## Why it's built this way

**Claude handles the conversation and product selection; a deterministic engine
handles every number.** The model never does arithmetic that lands on a customer
quote — that split is what keeps quoting accurate at scale. The pricing rules live
in one place on the server (`services/pricing.ts`) and are mirrored on the client
(`pricing.ts`) purely for instant live preview; the server always recomputes
authoritatively when a quote is finalized.

```
web/                         Vue 3 SPA
  src/stores/quote.ts          conversation flow + selection + live totals
  src/components/              chat thread, composer, quote panel, preview, calendar
server/
  src/services/pricing.ts      deterministic pricing engine (source of truth)
  src/services/claude.ts       Anthropic Messages API call + local fallback
  src/services/pdf.ts          branded quote PDF (PDFKit)
  src/services/mailer.ts       email delivery (Nodemailer; dry-run without SMTP)
  src/services/calendar.ts     Google / Outlook / .ics follow-up reminders
  db/schema.sql, db/seed.sql   Postgres schema + pricelist seed
```

---

## What's real vs. stubbed

| Area | Status |
| --- | --- |
| Claude firewall recommendation | **Real** — Messages API; falls back locally if no key |
| Pricing engine (discount / impl / managed / markup) | **Real** — deterministic, typed |
| Quote PDF | **Real** — branded PDF via PDFKit |
| Quote numbering (`/api/quotes/next-number`) | **Real** — starts 643555, then max+1 |
| Persistence | **Real** — PostgreSQL (quotes, items, resellers) |
| Calendar reminders | **Real** — Google/Outlook links + downloadable `.ics` |
| Email send | **Real if SMTP set**, otherwise dry-run (logs payload) |
| Auth | **Stub** — issues a JWT for any email; swap for Auth0/Supabase in prod |
| Calendar OAuth event creation | **Stub** — link-based today; Phase-3 upgrade |

---

## Quick start (local)

Requires **Node 18+** and a **PostgreSQL** instance.

```bash
# 1. install
npm run install:all            # root + server + web

# 2. configure the backend
cp server/.env.example server/.env
#   set DATABASE_URL (a local Postgres is fine)
#   optionally set ANTHROPIC_API_KEY (runs on the fallback recommendation if absent)

# 3. create tables + auto-import the bundled pricelist
npm --prefix server run migrate

# 4. run both (API :4000, web :5173)
npm run dev
```

Open http://localhost:5173, sign in with any email, and type
*"best firewall for a 200-user office"*. The Vite dev server proxies `/api` to the
backend, so no CORS setup is needed locally.

---

## Pricelist

The real Palo Alto pricelist lives in `server/db/PANW_Pricelist.xlsx` and is
parsed by `server/src/services/importPricelist.ts`. On first boot, if the
`products` table is empty, the bundled sheet is **auto-imported**.

To refresh it after editing the spreadsheet (or to load a different one):

```bash
npm --prefix server run import:pricelist                 # bundled file
npm --prefix server run import:pricelist ../path/new.xlsx # a specific file
npm --prefix server run import:pricelist -- --dry         # parse + preview, no DB writes
```

The importer reads `Series · Model · Recommended Users · Form Factor · List Price · Notes`,
parses user ranges into a numeric ceiling, and classifies prices as one-time
(PA-Series), annual (VM-Series), or on-request (CN-Series). Cortex XDR is stored
as a per-user rate in `settings`.

**Two things to know about this sheet:** the recommendation/quote flow runs on
**PA-Series hardware** (consistent one-time pricing); VM-Series and CN-Series are
imported into `products` for completeness and are ready for a future "hardware vs
virtual" branch. And the sheet prices **hardware only** — PANW subscriptions
(Threat Prevention, URL Filtering, WildFire, DNS Security, SD-WAN) aren't in it,
so they aren't auto-quoted yet; add them as columns and they can be wired in.

---



```
PORT=4000
JWT_SECRET=change-me
CORS_ORIGIN=http://localhost:5173       # comma-separated list allowed
DATABASE_URL=postgresql://user:pass@host:5432/cloudnomics
PGSSL=false                             # set true on Railway/Render/Neon

ANTHROPIC_API_KEY=                      # optional; fallback used if empty
ANTHROPIC_MODEL=claude-sonnet-4-6

RESELLER_DISCOUNT=0.30                   # 30% off product SKUs
IMPL_RATE=0.15                          # implementation = 15% of its product
MANAGED_RATE=0.15                       # managed = 15% of subtotal
QUOTE_START=643555                      # first quote number

SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASS= FROM_EMAIL=   # optional
```

Frontend env (`web/.env`): leave `VITE_API_URL` empty in dev; in production set it
to the deployed API base (e.g. `https://cloudnomics-api.onrender.com`).

---

## API surface

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | — | Stub login → JWT |
| GET  | `/api/pricelist` | — | Current pricelist (from DB) |
| POST | `/api/recommend` | ✔ | Claude firewall recommendation `{requirement}` |
| GET  | `/api/quotes/next-number` | ✔ | Next quote number |
| POST | `/api/quotes` | ✔ | Build + persist a quote from selections |
| GET  | `/api/quotes/:n/pdf` | ✔ | Branded quote PDF |
| POST | `/api/quotes/:n/send` | ✔ | Email the quote |
| POST | `/api/calendar/reminder` | ✔ | Google/Outlook URLs + `.ics` |

---

## Deploy

**Frontend → Vercel:** import the repo, set root to `web/`, framework Vite. Add
`VITE_API_URL` pointing at the API. `vercel.json` already handles SPA rewrites.

**Backend + DB → Railway or Render:**
- *Render:* the included `server/render.yaml` blueprint provisions the web service
  and a managed Postgres, wiring `DATABASE_URL` automatically. Set `ANTHROPIC_API_KEY`
  and `CORS_ORIGIN` (your Vercel URL) as secrets.
- *Railway:* create a service from `server/`, add the Postgres plugin (it injects
  `DATABASE_URL`), set `PGSSL=true` and the same env vars.

Migrations run automatically on boot (and the bundled pricelist auto-imports if
the `products` table is empty); you can also run `npm --prefix server run migrate`
or `npm --prefix server run import:pricelist`.

---

## Production roadmap (from the original brief)

- **Phase 1 — done:** reseller login, Claude chat + pricelist lookup, pricing engine, quote PDF, persistence.
- **Phase 2:** real mail provider (SendGrid/SES), logo storage (S3), quote history UI.
- **Phase 3:** Google + Microsoft Calendar OAuth (create events directly, not just links).
- **Phase 4:** real auth (Auth0/Supabase), per-reseller discount tiers, more product lines (SD-WAN, Prisma Access).

---

## Security notes

- Secrets stay server-side; the Anthropic key is **never** sent to the browser.
- Auth is a stub — replace before shipping and keep every mutating route protected.
- Store OAuth refresh tokens encrypted at rest; never put tokens or personal data in URLs.

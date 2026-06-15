# Deploy — Railway (API + Postgres) + Vercel (web)

The frontend needs the API's URL and the API needs the frontend's URL (CORS), so
deploy in this order: **Railway first**, then **Vercel**, then come back and set
`CORS_ORIGIN`.

## 1. Railway — API + Postgres

1. **New Project → Deploy from GitHub repo** → `Comanage360/cloudnomics-distributor`.
2. Open the service → **Settings**:
   - **Root Directory:** `server`
   - Build/Start come from `server/railway.json` (`npm install && npm run build`, `npm start`),
     health check `/api/health`.
3. **+ New → Database → PostgreSQL.** Railway injects `DATABASE_URL` into the service.
4. Service → **Variables** — add:

   | Key | Value |
   | --- | --- |
   | `PGSSL` | `true` |
   | `JWT_SECRET` | (the strong secret — see chat) |
   | `ANTHROPIC_API_KEY` | your key (optional; omit to run on the local fallback) |
   | `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
   | `CORS_ORIGIN` | leave blank for now (set after Vercel) |

   `DATABASE_URL` is auto-injected; `PORT` is auto-injected by Railway — do not set it.
5. Deploy. On first boot the server runs `migrate()` (creates schema, seeds, and
   auto-imports `server/db/PANW_Pricelist.xlsx`).
6. Service → **Settings → Networking → Generate Domain.** Copy the URL, e.g.
   `https://cloudnomics-distributor-production.up.railway.app`.
7. Sanity check: open `<API_URL>/api/health` → `{"ok":true}`.

## 2. Vercel — web

1. **Add New → Project →** import `Comanage360/cloudnomics-distributor`.
2. **Root Directory:** `web` (framework auto-detects Vite; build/output come from
   `web/vercel.json`).
3. **Environment Variables:**

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | the Railway API URL from step 1.6 (no trailing slash) |

4. Deploy. Copy the production URL, e.g. `https://cloudnomics-distributor.vercel.app`.

## 3. Close the CORS loop

Back in **Railway → Variables**, set `CORS_ORIGIN` to the Vercel URL (exact origin,
no trailing slash; comma-separate if you add a custom domain later) and redeploy.

## Verify end to end

1. Open the Vercel URL, sign in with any email (auth is a stub).
2. "best firewall for a 200-user office" → recommendation + quote.
3. Build through to **Preview customer quote → Print / Save as PDF**.
4. (If `ANTHROPIC_API_KEY` is set) recommendations come from Claude; otherwise the
   keyword fallback is used — both are fine.

## Notes
- Email send is dry-run unless `SMTP_*` vars are set (logs the payload).
- Auth is a JWT-for-any-email stub — replace before real production use.

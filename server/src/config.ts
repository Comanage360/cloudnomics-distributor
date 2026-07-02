import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/cloudnomics",
  pgSsl: String(process.env.PGSSL || "false") === "true",
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    version: process.env.ANTHROPIC_VERSION || "2023-06-01",
  },
  pricing: {
    discount: Number(process.env.RESELLER_DISCOUNT ?? 0.3),
    competitiveBonus: Number(process.env.COMPETITIVE_DISCOUNT ?? 0.1), // extra off for a competitive upgrade
    implRate: Number(process.env.IMPL_RATE ?? 0.15),
    managedRate: Number(process.env.MANAGED_RATE ?? 0.15),
    markupDefault: Number(process.env.MARKUP_DEFAULT ?? 15),
    markupMin: Number(process.env.MARKUP_MIN ?? 10),
    markupMax: Number(process.env.MARKUP_MAX ?? 20),
    costLimitMonthly: Number(process.env.COST_LIMIT_MONTHLY ?? 10), // default rolling-30d AI spend cap (USD); 0 = unlimited
    quoteStart: Number(process.env.QUOTE_START ?? 643555),
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.FROM_EMAIL || "quotes@cloudnomics.net",
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || "",
  },
  aiPricing: {
    // USD per 1M tokens (override per your Anthropic plan). Defaults ≈ Sonnet.
    inputPerM: Number(process.env.AI_INPUT_PER_M ?? 3),
    outputPerM: Number(process.env.AI_OUTPUT_PER_M ?? 15),
  },
};

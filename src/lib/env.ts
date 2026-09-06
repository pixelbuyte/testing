const read = (key: string) => {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

export const env = {
  appUrl: read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  appSecret: read("APP_SECRET") ?? "dev-only-secret-change-me-please-32chars!!",
  databaseUrl: read("DATABASE_URL"),
  pgliteDir: read("PGLITE_DIR") ?? ".data/pglite",
  resendApiKey: read("RESEND_API_KEY"),
  emailFrom: read("EMAIL_FROM") ?? "PastDue <recover@mail.pastdue.app>",
  anthropicApiKey: read("ANTHROPIC_API_KEY"),
  anthropicModel: read("ANTHROPIC_MODEL") ?? "claude-sonnet-5",
  stripeSecretKey: read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
  stripePriceStandard: read("STRIPE_PRICE_STANDARD"),
  stripePricePro: read("STRIPE_PRICE_PRO"),
  cronSecret: read("CRON_SECRET"),
  allowDevTools: read("ALLOW_DEV_TOOLS") === "true" || process.env.NODE_ENV !== "production",
  isProd: process.env.NODE_ENV === "production",
};

export const capabilities = () => ({
  db: env.databaseUrl ? "postgres" : "pglite",
  email: env.resendApiKey ? "resend" : "outbox",
  ai: env.anthropicApiKey ? "anthropic" : "templates",
  billing: env.stripeSecretKey && env.stripePriceStandard ? "stripe" : "disabled",
});

/** Idempotent schema bootstrap. Kept in one place so PGlite and Postgres stay identical. */
export const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  plan_status text NOT NULL DEFAULT 'none',
  billing_customer_id text,
  billing_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS login_codes (
  id text PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes (email);

CREATE TABLE IF NOT EXISTS connections (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL,
  business_name text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  key_ciphertext text NOT NULL,
  key_last4 text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_name text NOT NULL,
  founder_name text NOT NULL DEFAULT '',
  reply_to text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'friendly',
  auto_send boolean NOT NULL DEFAULT false,
  sequences jsonb,
  sequences_source text NOT NULL DEFAULT 'templates',
  last_scan_at timestamptz,
  last_scan jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connections_user_idx ON connections (user_id);

CREATE TABLE IF NOT EXISTS recoveries (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL,
  stripe_invoice_id text,
  customer_email text,
  customer_name text,
  plan_name text NOT NULL,
  price_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'usd',
  amount_cents integer NOT NULL,
  mrr_cents integer NOT NULL,
  ltv_cents integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  decline_code text,
  snapshot jsonb,
  pay_url text,
  status text NOT NULL DEFAULT 'draft',
  step_index integer NOT NULL DEFAULT 0,
  start_at timestamptz,
  next_send_at timestamptz,
  recovered_at timestamptz,
  recovered_cents integer,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recoveries_unique_case ON recoveries (connection_id, stripe_subscription_id, bucket);
CREATE INDEX IF NOT EXISTS recoveries_status_idx ON recoveries (status, next_send_at);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  recovery_id text NOT NULL REFERENCES recoveries(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  to_email text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  subject text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL,
  provider_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_recovery_idx ON messages (recovery_id);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  user_id text,
  name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_name_idx ON events (name, created_at);
`;

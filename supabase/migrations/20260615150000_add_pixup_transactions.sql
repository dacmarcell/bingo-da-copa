-- Migration: add Pixup transactions, token cache, audit logs, and subscription fields

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric(10,2) not null,
  status text not null default 'PENDING',
  gateway text not null default 'pixup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz,
  qr_code text,
  qr_code_text text,
  external_id text unique,
  pixup_charge_id text unique,
  metadata jsonb
);
create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_status_idx on public.transactions (status);

create table if not exists public.payment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  webhook_event_id text,
  event text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_audit_logs_webhook_event_id_idx on public.payment_audit_logs (webhook_event_id) where webhook_event_id is not null;

create table if not exists public.pixup_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text not null,
  refresh_token text,
  scope text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists status text default 'inactive',
  add column if not exists starts_at timestamptz,
  add column if not exists paid_at timestamptz;

create unique index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);

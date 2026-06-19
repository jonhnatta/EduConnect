-- Migration 039: rate limiting genérico (login, signup, ações sociais).
-- Cada "bucket" é uma chave (ex.: "login:email", "signup:ip", "comment:userId").

create table if not exists public.rate_limits (
  bucket            text        primary key,
  window_started_at timestamptz not null default timezone('utc'::text, now()),
  count             integer     not null default 0,
  updated_at        timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_rate_limits_window
  on public.rate_limits (window_started_at);

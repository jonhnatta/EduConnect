-- Migration 034: Rate limit para troca de senha autenticada (changePassword)
-- Janela deslizante de 15 minutos, máximo de 5 tentativas por usuário.

create table if not exists public.password_change_limits (
  user_id           uuid        primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default timezone('utc'::text, now()),
  attempt_count     integer     not null default 0,
  updated_at        timestamptz not null default timezone('utc'::text, now()),
  check (attempt_count >= 0)
);

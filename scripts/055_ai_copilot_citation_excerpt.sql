alter table public.ai_citations
  add column if not exists excerpt text not null default '';

alter table public.ai_runs
  add column if not exists safety_decision text,
  add column if not exists safety_reason_code text,
  add column if not exists safety_policy_version text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_ai_runs_safety_decision'
       and conrelid = 'public.ai_runs'::regclass
  ) then
    alter table public.ai_runs
      add constraint ck_ai_runs_safety_decision
      check (safety_decision is null or safety_decision in ('approved', 'approved_with_warning', 'regenerate', 'abstain', 'blocked', 'human_review_required'));
  end if;
end
$$;

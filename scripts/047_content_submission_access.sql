create or replace function public.student_can_submit_content_item(
  p_content_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.user_can_view_content_item(p_content_id, p_user_id)
    and exists (
      select 1
        from public.profiles p
        join public.users u on u.id = p.id
       where p.id = p_user_id
         and p.user_type = 'aluno'
         and p.deleted_at is null
         and p.account_status = 'active'
         and u.email_verified_at is not null
    );
$$;

comment on function public.student_can_submit_content_item(uuid, uuid) is
  'Politica canonica para leitura e submissao de avaliacao por aluno ativo e verificado.';

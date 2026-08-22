create or replace function public.join_classroom_by_invite(p_user_id uuid, p_invite_code text)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_classroom_id uuid;
  v_max integer;
  v_count integer;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_user_id and user_type = 'aluno'
       and deleted_at is null and account_status = 'active'
  ) then
    return json_build_object('ok', false, 'error', 'only_students');
  end if;

  -- The row lock serializes capacity checks for the same classroom.
  select c.id, c.max_students into v_classroom_id, v_max
    from public.classrooms c
   where upper(trim(c.invite_code)) = upper(trim(p_invite_code))
     and c.status = 'ativa'
   for update;
  if v_classroom_id is null then
    return json_build_object('ok', false, 'error', 'invalid_or_closed');
  end if;
  if exists (
    select 1 from public.classroom_members
     where classroom_id = v_classroom_id and student_id = p_user_id
  ) then
    return json_build_object('ok', true, 'classroom_id', v_classroom_id);
  end if;
  select count(*)::integer into v_count
    from public.classroom_members where classroom_id = v_classroom_id;
  if v_max is not null and v_count >= v_max then
    return json_build_object('ok', false, 'error', 'full');
  end if;
  insert into public.classroom_members (classroom_id, student_id)
  values (v_classroom_id, p_user_id)
  on conflict (classroom_id, student_id) do nothing;
  return json_build_object('ok', true, 'classroom_id', v_classroom_id);
end;
$$;

-- Migration 038: aplica a AUDIÊNCIA na função canônica de visibilidade.
-- Antes, audience só era filtrada no feed; acesso direto por UUID (/conteudo/[id],
-- ações sociais, download de anexo) ignorava audience. Agora a regra é central.

create or replace function public.user_can_view_content_item(p_content_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v record;
  v_user_type text;
begin
  select ci.id, ci.author_id, ci.status, ci.visibility, ci.audience
  into v
  from public.content_items ci
  where ci.id = p_content_id;

  if v.id is null then
    return false;
  end if;

  -- Não publicado: só o autor.
  if v.status <> 'published' then
    return p_user_id is not null and v.author_id = p_user_id;
  end if;

  -- Autor sempre vê o próprio conteúdo.
  if p_user_id is not null and v.author_id = p_user_id then
    return true;
  end if;

  if v.visibility = 'private' then
    return false; -- autor já retornou acima
  end if;

  if v.visibility = 'public' then
    -- Audiência: 'all' = todos; 'students' = só alunos; 'teachers' = só professores.
    if v.audience = 'all' or v.audience is null then
      return true;
    end if;
    if p_user_id is null then
      return false;
    end if;
    select user_type into v_user_type from public.profiles where id = p_user_id;
    if v.audience = 'teachers' then
      return v_user_type = 'professor';
    elsif v.audience = 'students' then
      return v_user_type = 'aluno';
    end if;
    return true;
  end if;

  if v.visibility = 'classrooms' then
    if p_user_id is null then
      return false;
    end if;
    return exists (
      select 1
      from public.content_item_classrooms cic
      where cic.content_item_id = p_content_id
        and public.is_classroom_member(cic.classroom_id, p_user_id)
    );
  end if;

  return false;
end;
$$;

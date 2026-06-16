-- Feed por relevância de follow: conteúdo de professores que o aluno SEGUE sobe ao topo;
-- o restante do conteúdo público/visível continua aparecendo abaixo (sem cold-start vazio).
create or replace function public.feed_content_items_for_user(p_user_id uuid, p_limit int default 20)
returns setof public.content_items
language sql
stable
set search_path = public
as $$
  select ci.*
  from public.content_items ci
  where ci.status = 'published'
    and (
      ci.visibility = 'public'
      or (
        ci.visibility = 'classrooms'
        and exists (
          select 1 from public.content_item_classrooms cic
          where cic.content_item_id = ci.id
            and public.is_classroom_member(cic.classroom_id, p_user_id)
        )
      )
      or (
        ci.visibility = 'private'
        and ci.author_id = p_user_id
      )
    )
  order by
    -- 1) conteúdo de quem o aluno segue vem primeiro
    (exists (
      select 1 from public.teacher_followers tf
      where tf.teacher_id = ci.author_id
        and tf.student_id = p_user_id
    )) desc,
    ci.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

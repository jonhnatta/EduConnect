-- Migration 037: audiência da publicação (só relevante para conteúdo público)
-- 'all' = todos · 'students' = só alunos · 'teachers' = só professores (comunidade)

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_audience_check'
  ) THEN
    ALTER TABLE public.content_items
      ADD CONSTRAINT content_items_audience_check
        CHECK (audience IN ('all', 'students', 'teachers'));
  END IF;
END;
$$;

-- Feed do aluno: nunca mostrar conteúdo destinado só a professores.
-- (Reescreve a função do feed para filtrar por audiência.)
CREATE OR REPLACE FUNCTION public.feed_content_items_for_user(p_user_id uuid, p_limit int default 20)
RETURNS setof public.content_items
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select ci.*
  from public.content_items ci
  where ci.status = 'published'
    and ci.audience <> 'teachers'   -- aluno não vê conteúdo exclusivo de professores
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
    (exists (
      select 1 from public.teacher_followers tf
      where tf.teacher_id = ci.author_id
        and tf.student_id = p_user_id
    )) desc,
    ci.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

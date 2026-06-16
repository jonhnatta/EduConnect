-- Seguidores de professores (EduConnect)
-- Aplicar após scripts/001_create_profiles.sql.

-- Contador desnormalizado em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

-- Tabela de follows
CREATE TABLE IF NOT EXISTS public.teacher_followers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_followers_unique UNIQUE (teacher_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_followers_teacher
  ON public.teacher_followers (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_followers_student
  ON public.teacher_followers (student_id);

-- Trigger: mantém profiles.followers_count sincronizado
CREATE OR REPLACE FUNCTION public.update_teacher_followers_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET followers_count = followers_count + 1
    WHERE id = NEW.teacher_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET followers_count = GREATEST(followers_count - 1, 0)
    WHERE id = OLD.teacher_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_teacher_followers_count ON public.teacher_followers;
CREATE TRIGGER tr_teacher_followers_count
  AFTER INSERT OR DELETE ON public.teacher_followers
  FOR EACH ROW EXECUTE FUNCTION public.update_teacher_followers_count();

-- RLS
ALTER TABLE public.teacher_followers ENABLE ROW LEVEL SECURITY;

-- Aluno vê apenas seus próprios follows
CREATE POLICY "tf_select_own_student"
  ON public.teacher_followers FOR SELECT
  USING (student_id = auth.uid());

-- Professor vê os próprios seguidores
CREATE POLICY "tf_select_own_teacher"
  ON public.teacher_followers FOR SELECT
  USING (teacher_id = auth.uid());

-- Apenas alunos podem criar follow para si mesmos
CREATE POLICY "tf_insert_student"
  ON public.teacher_followers FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND user_type = 'aluno'
    )
    AND teacher_id <> auth.uid()
  );

-- Aluno deleta apenas o próprio follow
CREATE POLICY "tf_delete_own"
  ON public.teacher_followers FOR DELETE
  USING (student_id = auth.uid());

-- Recalcula contadores para rows já existentes (idempotente)
UPDATE public.profiles p
SET followers_count = (
  SELECT COUNT(*) FROM public.teacher_followers tf
  WHERE tf.teacher_id = p.id
)
WHERE p.user_type = 'professor';

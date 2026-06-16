-- Avaliações de professor (reputação). Um aluno avalia um professor 1x (upsert).
CREATE TABLE IF NOT EXISTS public.professor_reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professor_reviews_unique UNIQUE (teacher_id, student_id),
  CONSTRAINT professor_reviews_not_self CHECK (teacher_id <> student_id)
);

CREATE INDEX IF NOT EXISTS idx_professor_reviews_teacher
  ON public.professor_reviews (teacher_id);

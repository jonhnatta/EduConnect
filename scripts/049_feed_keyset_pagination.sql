-- Índices para paginação keyset dos feeds.
-- As consultas usam (coalesce(published_at, created_at), id) como ordem total,
-- sem OFFSET e sem ordenar todos os registros antes de aplicar o limite.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_items_student_feed_page
  ON public.content_items (
    (coalesce(published_at, created_at)) DESC,
    id DESC
  )
  INCLUDE (author_id, visibility, type)
  WHERE status = 'published'
    AND audience IN ('all', 'students');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_items_community_feed_page
  ON public.content_items (
    (coalesce(published_at, created_at)) DESC,
    id DESC
  )
  INCLUDE (author_id, type)
  WHERE status = 'published'
    AND visibility = 'public'
    AND audience IN ('all', 'teachers');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_items_student_feed_type_page
  ON public.content_items (
    type,
    (coalesce(published_at, created_at)) DESC,
    id DESC
  )
  INCLUDE (author_id, visibility)
  WHERE status = 'published'
    AND audience IN ('all', 'students');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_items_feed_author_page
  ON public.content_items (
    author_id,
    (coalesce(published_at, created_at)) DESC,
    id DESC
  )
  INCLUDE (visibility, audience, type)
  WHERE status = 'published';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_items_feed_author_type_page
  ON public.content_items (
    author_id,
    type,
    (coalesce(published_at, created_at)) DESC,
    id DESC
  )
  INCLUDE (visibility, audience)
  WHERE status = 'published';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teacher_followers_student_teacher
  ON public.teacher_followers (student_id, teacher_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_comments_feed_preview
  ON public.content_comments (content_item_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL;

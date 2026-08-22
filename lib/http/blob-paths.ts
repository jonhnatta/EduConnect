const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
const SAFE_FILE = "[A-Za-z0-9._-]+"

const ARTICLE_PATH_RE = new RegExp(
  `^articles\\/(${UUID})\\/(?:trix|cover|dica)\\/${SAFE_FILE}$`,
  "i"
)
const PROFILE_PATH_RE = new RegExp(
  `^profiles\\/(${UUID})\\/(?:avatar|cover)-${SAFE_FILE}$`,
  "i"
)
const CLASSROOM_PATH_RE = new RegExp(
  [
    `^classroom-activities\\/(${UUID})\\/${SAFE_FILE}$`,
    `^classroom-activities\\/(${UUID})\\/trix\\/${SAFE_FILE}$`,
    `^classroom-activities\\/(${UUID})\\/submissions\\/${UUID}\\/${UUID}\\/${SAFE_FILE}$`,
    `^classroom-materials\\/(${UUID})\\/${SAFE_FILE}$`,
    `^classroom-mural\\/(${UUID})\\/cover-${SAFE_FILE}$`,
  ].join("|"),
  "i"
)

export function contentItemIdFromArticlePath(pathname: string): string | null {
  return ARTICLE_PATH_RE.exec(pathname)?.[1] ?? null
}

export function profileIdFromProfilePath(pathname: string): string | null {
  return PROFILE_PATH_RE.exec(pathname)?.[1] ?? null
}

export function classroomIdFromAttachmentPath(pathname: string): string | null {
  const match = CLASSROOM_PATH_RE.exec(pathname)
  if (!match) return null
  return match.slice(1).find((value): value is string => Boolean(value)) ?? null
}


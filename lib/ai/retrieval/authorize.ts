import { z } from "zod"

const uuid = z.string().uuid()

export type TrustedKnowledgeAccess = Readonly<{
  tenantId: string
  teacherId: string
  allowedClassroomIds: readonly string[]
}>

export type KnowledgeFilter = Readonly<{
  must: readonly Readonly<{ key: string; match: Readonly<{ value: string | boolean }> }>[]
}>

function requireTenantId(value: string): string {
  const normalized = value?.trim()
  if (!normalized || normalized.length > 100) throw new Error("invalid_tenant_id")
  return normalized
}

function requireUuid(value: string, code: string): string {
  if (!uuid.safeParse(value).success) throw new Error(code)
  return value
}

export function buildKnowledgeFilter(
  access: TrustedKnowledgeAccess,
  request: Readonly<{ classroomId?: string }>
): KnowledgeFilter {
  const tenantId = requireTenantId(access.tenantId)
  const teacherId = requireUuid(access.teacherId, "invalid_teacher_id")
  if (!Array.isArray(access.allowedClassroomIds)) throw new Error("invalid_classroom_access")
  const allowed = new Set(access.allowedClassroomIds.map((id) => requireUuid(id, "invalid_classroom_id")))
  const classroomId = request.classroomId === undefined
    ? undefined
    : requireUuid(request.classroomId, "invalid_classroom_id")
  if (classroomId !== undefined && !allowed.has(classroomId)) throw new Error("classroom_not_allowed")

  const must: { key: string; match: { value: string | boolean } }[] = [
    { key: "tenant_id", match: { value: tenantId } },
    { key: "teacher_id", match: { value: teacherId } },
  ]
  if (classroomId !== undefined) must.push({ key: "classroom_id", match: { value: classroomId } })
  must.push({ key: "active", match: { value: true } })
  return { must }
}

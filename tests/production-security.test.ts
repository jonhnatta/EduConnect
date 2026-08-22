import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { isSessionAccountStateValid } from "../lib/auth/session-state.ts"
import { matchesDeclaredDocumentType } from "../lib/security/file-signature.ts"
import { totpCode, verifyTotp } from "../lib/auth/totp.ts"
import { encryptEmailPayload } from "../lib/email/encryption.ts"
import { productionConfigErrors } from "../lib/config/production.ts"
import {
  classroomIdFromAttachmentPath,
  contentItemIdFromArticlePath,
  profileIdFromProfilePath,
} from "../lib/http/blob-paths.ts"

test("session state requires active, verified and matching version", () => {
  const valid = {
    sessionVersion: 4,
    emailVerifiedAt: "2026-07-14T00:00:00Z",
    deletedAt: null,
    accountStatus: "active",
  }
  assert.equal(isSessionAccountStateValid(4, valid), true)
  assert.equal(isSessionAccountStateValid(3, valid), false)
  assert.equal(isSessionAccountStateValid(4, { ...valid, deletedAt: "2026-07-14" }), false)
  assert.equal(isSessionAccountStateValid(4, { ...valid, accountStatus: "suspended" }), false)
  assert.equal(isSessionAccountStateValid(4, { ...valid, emailVerifiedAt: null }), false)
})

test("document signatures cannot be forged with only a MIME value", () => {
  assert.equal(matchesDeclaredDocumentType(Buffer.from("%PDF-1.7"), "application/pdf"), true)
  assert.equal(matchesDeclaredDocumentType(Buffer.from("not a pdf"), "application/pdf"), false)
  assert.equal(matchesDeclaredDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true)
  assert.equal(matchesDeclaredDocumentType(Buffer.from("<svg>"), "image/jpeg"), false)
})

test("TOTP follows the RFC 6238 SHA1 vector reduced to six digits", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
  assert.equal(totpCode(secret, 59_000), "287082")
  assert.equal(verifyTotp(secret, "287082", 59_000), true)
  assert.equal(verifyTotp(secret, "000000", 59_000), false)
})

test("email queue payload does not persist the code in plaintext", () => {
  process.env.EMAIL_PAYLOAD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  const encrypted = encryptEmailPayload({ code: "123456" })
  assert.match(encrypted, /^v1\./)
  assert.equal(encrypted.includes("123456"), false)
})

test("production config rejects remote HTTP and mismatched origins", () => {
  const common = {
    AUTH_SECRET: "a".repeat(32),
    EMAIL_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    ADMIN_SESSION_SECRET: "b".repeat(32),
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "EduConnect <no-reply@example.test>",
    CRON_SECRET: "c".repeat(32),
    REDIS_QUEUE_URL: "redis://queue:6379/0",
    REDIS_CACHE_URL: "redis://cache:6379/0",
    S3_BUCKET: "educonnect",
    S3_ACCESS_KEY: "app",
    S3_SECRET_KEY: "secret",
    BLOB_READ_WRITE_TOKEN: "legacy",
    LEGAL_CONTROLLER_NAME: "EduConnect Teste",
    LEGAL_CONTROLLER_ID: "test-id",
    LEGAL_CONTROLLER_ADDRESS: "Rua Teste, Sao Paulo/SP",
    LEGAL_DPO_NAME: "DPO Teste",
    LEGAL_PRIVACY_EMAIL: "privacidade@example.test",
    LEGAL_SUPPORT_EMAIL: "contato@example.test",
    LEGAL_FORUM: "Sao Paulo/SP",
    LEGAL_HOSTING_PROVIDER: "Provedor Teste",
  }
  assert.ok(productionConfigErrors({
    ...common,
    AUTH_URL: "http://app.example.test",
    NEXT_PUBLIC_APP_URL: "https://other.example.test",
    ALLOW_INSECURE_LOCAL_ORIGIN: "true",
  }).length >= 2)
  assert.deepEqual(productionConfigErrors({
    ...common,
    AUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    ALLOW_INSECURE_LOCAL_ORIGIN: "true",
  }), [])
})

test("blob serving paths are validated as a complete strict pathname", () => {
  const contentId = "11111111-1111-4111-8111-111111111111"
  const classroomId = "22222222-2222-4222-8222-222222222222"
  const activityId = "33333333-3333-4333-8333-333333333333"
  const studentId = "44444444-4444-4444-8444-444444444444"

  assert.equal(contentItemIdFromArticlePath(`articles/${contentId}/trix/abc-1.png`), contentId)
  assert.equal(contentItemIdFromArticlePath(`articles/${contentId}/cover/video.webm`), contentId)
  assert.equal(contentItemIdFromArticlePath(`articles/${contentId}/dica/image_1.webp`), contentId)
  assert.equal(contentItemIdFromArticlePath(`articles/${contentId}/trix/../secret.png`), null)
  assert.equal(contentItemIdFromArticlePath(`articles/${contentId}/other/file.png`), null)
  assert.equal(contentItemIdFromArticlePath(`articles/${contentId}/trix/file.png/extra`), null)

  assert.equal(classroomIdFromAttachmentPath(`classroom-activities/${classroomId}/file.pdf`), classroomId)
  assert.equal(classroomIdFromAttachmentPath(`classroom-activities/${classroomId}/trix/image.png`), classroomId)
  assert.equal(
    classroomIdFromAttachmentPath(
      `classroom-activities/${classroomId}/submissions/${activityId}/${studentId}/work.docx`
    ),
    classroomId
  )
  assert.equal(classroomIdFromAttachmentPath(`classroom-materials/${classroomId}/file.pdf`), classroomId)
  assert.equal(classroomIdFromAttachmentPath(`classroom-mural/${classroomId}/cover-image.png`), classroomId)
  assert.equal(classroomIdFromAttachmentPath(`classroom-activities/${classroomId}/../file.pdf`), null)
  assert.equal(classroomIdFromAttachmentPath(`classroom-activities/${classroomId}//file.pdf`), null)

  assert.equal(profileIdFromProfilePath(`profiles/${studentId}/avatar-photo.jpg`), studentId)
  assert.equal(profileIdFromProfilePath(`profiles/${studentId}/cover-photo.jpg`), studentId)
  assert.equal(profileIdFromProfilePath(`profiles/${studentId}/avatar/extra.jpg`), null)
})

test("production boundaries enforce current migrations, privacy and RBAC", () => {
  const ready = readFileSync(new URL("../app/api/health/ready/route.ts", import.meta.url), "utf8")
  const profileImage = readFileSync(new URL("../app/api/profile-image/route.ts", import.meta.url), "utf8")
  const worker = readFileSync(new URL("../workers/worker.mjs", import.meta.url), "utf8")
  const queueAdmin = readFileSync(new URL("../app/actions/admin-queue-operations.ts", import.meta.url), "utf8")
  assert.match(ready, /version = '00550'/)
  assert.match(profileImage, /user\?\.id !== profileId/)
  assert.match(worker, /user_can_view_content_item\(\$4::uuid, tf\.student_id\)/)
  assert.match(queueAdmin, /admin\.role !== "admin"/)
})

test("restricted content publishing updates visibility atomically", () => {
  const source = readFileSync(new URL("../app/actions/content-items.ts", import.meta.url), "utf8")
  for (const name of ["publishExercise", "publishAssessment", "publishSimulado"]) {
    const start = source.indexOf(`export async function ${name}`)
    assert.notEqual(start, -1)
    const next = source.indexOf("export async function ", start + 30)
    const body = source.slice(start, next === -1 ? undefined : next)
    assert.match(body, /withTransaction\(async \(client\)/)
    assert.match(body, /replaceContentItemClassrooms\(client/)
  }
})

test("account deletion immediately removes every public surface", () => {
  const account = readFileSync(new URL("../app/actions/account.ts", import.meta.url), "utf8")
  const professors = readFileSync(new URL("../app/actions/professors.ts", import.meta.url), "utf8")
  const classrooms = readFileSync(new URL("../app/actions/classrooms.ts", import.meta.url), "utf8")
  const studentProfile = readFileSync(new URL("../app/aluno/[slug]/page.tsx", import.meta.url), "utf8")
  const trustSafety = readFileSync(new URL("../app/actions/trust-safety.ts", import.meta.url), "utf8")

  assert.match(account, /withTransaction\(async \(client\)/)
  assert.match(account, /profile_visibility = 'private'/)
  assert.match(account, /content_items set status = 'draft'/)
  assert.match(account, /classrooms set is_public = false, status = 'encerrada'/)
  assert.match(professors, /p\.deleted_at is null/i)
  assert.match(professors, /p\.account_status = 'active'/i)
  assert.match(classrooms, /p\.deleted_at IS NULL AND p\.account_status = 'active'/)
  assert.match(studentProfile, /and deleted_at is null[\s\S]*and account_status = 'active'/)
  assert.doesNotMatch(trustSafety, /classrooms set visibility/)
})

test("administrative MFA rate limiting fails closed", () => {
  const source = readFileSync(new URL("../app/admin/mfa/actions.ts", import.meta.url), "utf8")
  assert.match(source, /admin-mfa:[\s\S]*failClosed: true/)
})

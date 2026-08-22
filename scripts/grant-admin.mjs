import { createCipheriv, randomBytes } from "node:crypto"
import pg from "pg"

const email = process.argv[2]?.toLowerCase().trim()
const role = process.argv[3] ?? "reviewer"
if (!email || !email.includes("@") || !["reviewer", "admin"].includes(role)) {
  throw new Error("Usage: npm run admin:grant -- email@example.com reviewer|admin")
}

const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
if (!databaseUrl) throw new Error("Missing DATABASE_MIGRATION_URL")
const key = Buffer.from(process.env.ADMIN_TOTP_ENCRYPTION_KEY ?? "", "base64")
if (key.length !== 32) throw new Error("ADMIN_TOTP_ENCRYPTION_KEY must decode to 32 bytes")

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function base32(buffer) {
  let bits = ""
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0")
  let output = ""
  for (let offset = 0; offset < bits.length; offset += 5) {
    output += alphabet[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)]
  }
  return output
}

function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".")
}

const secret = base32(randomBytes(20))
const ssl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true }
const client = new pg.Client({ connectionString: databaseUrl, ssl })
try {
  await client.connect()
  const user = await client.query(
    "select id, email_verified_at from public.users where email = $1",
    [email]
  )
  if (!user.rows[0]) throw new Error("User not found")
  if (!user.rows[0].email_verified_at) throw new Error("Admin email must be verified")
  await client.query(
    `insert into public.admin_users (user_id, role, totp_secret_encrypted)
     values ($1, $2, $3)
     on conflict (user_id) do update set role = excluded.role,
       totp_secret_encrypted = excluded.totp_secret_encrypted, active = true`,
    [user.rows[0].id, role, encrypt(secret)]
  )
  const uri = `otpauth://totp/EduConnect:${encodeURIComponent(email)}?secret=${secret}&issuer=EduConnect&algorithm=SHA1&digits=6&period=30`
  console.info("Admin provisioned. Register this secret now; it will not be shown again.")
  console.info(`Secret: ${secret}`)
  console.info(`URI: ${uri}`)
} finally {
  await client.end().catch(() => {})
}

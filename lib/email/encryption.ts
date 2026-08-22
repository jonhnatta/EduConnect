import { createCipheriv, randomBytes } from "node:crypto"

function encryptionKey(): Buffer {
  const encoded = process.env.EMAIL_PAYLOAD_ENCRYPTION_KEY
  if (!encoded) throw new Error("Missing env var: EMAIL_PAYLOAD_ENCRYPTION_KEY")
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32) {
    throw new Error("EMAIL_PAYLOAD_ENCRYPTION_KEY must be 32 bytes encoded as base64")
  }
  return key
}

export function encryptEmailPayload(payload: Record<string, string>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".")
}

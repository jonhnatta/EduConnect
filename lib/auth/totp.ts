import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Decode(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "")
  let bits = ""
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) throw new Error("Invalid TOTP secret")
    bits += index.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }
  return Buffer.from(bytes)
}

function encryptionKey(): Buffer {
  const encoded = process.env.ADMIN_TOTP_ENCRYPTION_KEY
  if (!encoded) throw new Error("Missing env var: ADMIN_TOTP_ENCRYPTION_KEY")
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32) throw new Error("ADMIN_TOTP_ENCRYPTION_KEY must decode to 32 bytes")
  return key
}

export function decryptTotpSecret(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".")
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted TOTP secret")
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function totpCode(secret: string, timestamp = Date.now()): string {
  const counter = BigInt(Math.floor(timestamp / 30_000))
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(counter)
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const number =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return String(number % 1_000_000).padStart(6, "0")
}

export function verifyTotp(secret: string, candidate: string, timestamp = Date.now()): boolean {
  if (!/^\d{6}$/.test(candidate)) return false
  const received = Buffer.from(candidate)
  return [-30_000, 0, 30_000].some((drift) => {
    const expected = Buffer.from(totpCode(secret, timestamp + drift))
    return expected.length === received.length && timingSafeEqual(expected, received)
  })
}

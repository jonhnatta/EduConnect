import { randomBytes } from "node:crypto"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem I/O/0/1 para legibilidade

export function generateInviteCodeSegment(length = 4): string {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return out
}

// 6 caracteres do alfabeto de 32 simbolos = 32^6 ≈ 1,07 bilhao de combinacoes
// (antes eram 4 = ~1 milhao, enumeravel). Reduz drasticamente o brute-force do codigo.
export function buildInviteCode(): string {
  return `EDU-${generateInviteCodeSegment(6)}`
}

export function normalizeInviteCodeInput(code: string): string {
  return code.trim().toUpperCase()
}

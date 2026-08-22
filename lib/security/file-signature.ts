const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature)
}

export function matchesDeclaredDocumentType(buffer: Buffer, contentType: string): boolean {
  if (contentType === "application/pdf") return startsWith(buffer, Buffer.from("%PDF-", "ascii"))
  if (contentType === "image/png") return startsWith(buffer, PNG)
  if (contentType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  return false
}

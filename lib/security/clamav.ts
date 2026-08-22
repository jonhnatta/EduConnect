import net from "node:net"

const DEFAULT_PORT = 3310
const CHUNK_BYTES = 64 * 1024

function clamavAddress() {
  return {
    host: process.env.CLAMAV_HOST ?? "127.0.0.1",
    port: Number(process.env.CLAMAV_PORT ?? DEFAULT_PORT),
  }
}

function exchange(write: (socket: net.Socket) => void, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const { host, port } = clamavAddress()
    const socket = net.createConnection({ host, port })
    let response = ""
    const timeout = setTimeout(() => socket.destroy(new Error("ClamAV timeout")), timeoutMs)
    socket.on("connect", () => write(socket))
    socket.on("data", (chunk) => { response += chunk.toString("utf8") })
    socket.on("end", () => resolve(response.replace(/\0/g, "").trim()))
    socket.on("error", reject)
    socket.on("close", () => clearTimeout(timeout))
  })
}

export async function pingClamav(): Promise<void> {
  const response = await exchange((socket) => socket.end("zPING\0"), 2_000)
  if (response !== "PONG") throw new Error("ClamAV did not answer PONG")
}

export async function assertBufferIsClean(buffer: Buffer): Promise<void> {
  const response = await exchange((socket) => {
    socket.write("zINSTREAM\0")
    for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
      const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_BYTES, buffer.length))
      const size = Buffer.alloc(4)
      size.writeUInt32BE(chunk.length)
      socket.write(size)
      socket.write(chunk)
    }
    socket.write(Buffer.alloc(4))
  }, Number(process.env.CLAMAV_SCAN_TIMEOUT_MS ?? 30_000))

  if (response.endsWith(" OK")) return
  if (response.includes(" FOUND")) throw new Error("Arquivo rejeitado pela verificacao de seguranca")
  throw new Error(`Falha na verificacao de seguranca: ${response.slice(0, 200)}`)
}

export async function scanUploadBuffer(buffer: Buffer): Promise<void> {
  if (process.env.MALWARE_SCAN_ENABLED === "true") {
    await assertBufferIsClean(buffer)
    return
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("MALWARE_SCAN_ENABLED must be true in production")
  }
}

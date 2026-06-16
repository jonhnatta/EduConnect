/**
 * Wrapper sobre @vercel/blob.
 * Quando UPLOAD_SIMULATOR=true, salva arquivos em /tmp/blob-sim/ em vez de
 * fazer chamadas reais à API do Vercel Blob. Útil em dev/Docker sem token.
 */

import * as realBlob from "@vercel/blob"
import fs from "fs"
import nodePath from "path"

export const BLOB_SIM_SCHEME = "blob-sim://"

export function isUploadSimulator(): boolean {
  return process.env.UPLOAD_SIMULATOR === "true"
}

const SIM_DIR = "/tmp/blob-sim"

function simFilePath(pathname: string): string {
  // Remove traversal e leading slash
  const safe = pathname.replace(/\.\./g, "_").replace(/^\/+/, "")
  return nodePath.join(SIM_DIR, safe)
}

function pathnameFromRef(ref: string): string {
  if (ref.startsWith(BLOB_SIM_SCHEME)) return ref.slice(BLOB_SIM_SCHEME.length)
  // pathname puro (sem scheme)
  return ref
}

// ─── put ────────────────────────────────────────────────────────────────────

type PutOptions = Parameters<typeof realBlob.put>[2]
type PutResult = Awaited<ReturnType<typeof realBlob.put>>

export async function put(
  pathname: string,
  body: File | Blob | ArrayBuffer | ReadableStream | Buffer,
  options: PutOptions
): Promise<PutResult> {
  if (!isUploadSimulator()) {
    return realBlob.put(pathname, body as any, options as any)
  }

  const filePath = simFilePath(pathname)
  fs.mkdirSync(nodePath.dirname(filePath), { recursive: true })

  let buffer: Buffer
  if (Buffer.isBuffer(body)) {
    buffer = body
  } else if (body instanceof ArrayBuffer) {
    buffer = Buffer.from(body)
  } else if (body instanceof File || body instanceof Blob) {
    buffer = Buffer.from(await body.arrayBuffer())
  } else {
    // ReadableStream
    const chunks: Uint8Array[] = []
    const reader = (body as ReadableStream<Uint8Array>).getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    buffer = Buffer.concat(chunks)
  }

  fs.writeFileSync(filePath, buffer)

  const contentType =
    (options as any)?.contentType ?? "application/octet-stream"

  return {
    pathname,
    url: `${BLOB_SIM_SCHEME}${pathname}`,
    downloadUrl: `${BLOB_SIM_SCHEME}${pathname}`,
    contentType,
    contentDisposition: `inline; filename="${nodePath.basename(pathname)}"`,
    size: buffer.length,
    uploadedAt: new Date(),
  } as unknown as PutResult
}

// ─── get ────────────────────────────────────────────────────────────────────

type GetOptions = Parameters<typeof realBlob.get>[1]
type GetResult = Awaited<ReturnType<typeof realBlob.get>>

export async function get(
  pathname: string,
  options?: GetOptions
): Promise<GetResult> {
  if (!isUploadSimulator()) {
    return realBlob.get(pathname, options as any)
  }

  const filePath = simFilePath(pathname)
  if (!fs.existsSync(filePath)) return null

  const buffer = fs.readFileSync(filePath)
  const stat = fs.statSync(filePath)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer))
      controller.close()
    },
  })

  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-length": String(stat.size),
    "cache-control": "private, max-age=3600",
  })

  return {
    pathname,
    url: `${BLOB_SIM_SCHEME}${pathname}`,
    downloadUrl: `${BLOB_SIM_SCHEME}${pathname}`,
    contentType: "application/octet-stream",
    contentDisposition: `inline; filename="${nodePath.basename(pathname)}"`,
    size: stat.size,
    uploadedAt: stat.mtime,
    stream,
    headers,
  } as unknown as GetResult
}

// ─── del ────────────────────────────────────────────────────────────────────

type DelOptions = Parameters<typeof realBlob.del>[1]

export async function del(
  url: string | string[],
  options?: DelOptions
): Promise<void> {
  if (!isUploadSimulator()) {
    return realBlob.del(url as any, options as any)
  }

  const refs = Array.isArray(url) ? url : [url]
  for (const ref of refs) {
    const filePath = simFilePath(pathnameFromRef(ref))
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // best-effort, igual ao comportamento real
    }
  }
}

/**
 * Camada de storage de objetos — compatível com S3 (MinIO self-hosted, ou AWS S3 / Cloudflare R2).
 *
 * A interface (put/get/del) é a mesma usada em todo o app; só este arquivo conhece o backend.
 * - Produção/Docker: MinIO via env S3_* (bucket privado; o serving é feito pelas nossas rotas
 *   autenticadas em /api/*-attachment e /api/profile-image, então o bucket NUNCA fica público).
 * - Dev sem S3: UPLOAD_SIMULATOR=true grava em /tmp/blob-sim/.
 *
 * O identificador canônico de um objeto é o `pathname` (a key no bucket). put() retorna
 * url = pathname (as URLs de exibição são montadas pelas rotas a partir do pathname).
 */

import fs from "fs"
import nodePath from "path"
import { Readable } from "node:stream"
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3"
import { scanUploadBuffer } from "@/lib/security/clamav"

export const BLOB_SIM_SCHEME = "blob-sim://"

export function isUploadSimulator(): boolean {
  return process.env.UPLOAD_SIMULATOR === "true"
}

const SIM_DIR = "/tmp/blob-sim"

function simFilePath(pathname: string): string {
  const safe = pathname.replace(/\.\./g, "_").replace(/^\/+/, "")
  return nodePath.join(SIM_DIR, safe)
}

/** Extrai a key (pathname) de uma referência salva: displayUrl, blob-sim:// ou pathname puro. */
export function keyFromRef(ref: string): string {
  if (!ref) return ref
  if (ref.startsWith(BLOB_SIM_SCHEME)) return ref.slice(BLOB_SIM_SCHEME.length)
  if (ref.startsWith("/api/") || ref.includes("pathname=")) {
    const at = ref.indexOf("pathname=")
    if (at !== -1) {
      const rest = ref.slice(at + "pathname=".length)
      const end = rest.indexOf("&")
      return decodeURIComponent(end === -1 ? rest : rest.slice(0, end))
    }
  }
  return ref.replace(/^\/+/, "")
}

// ─── Cliente S3 (singleton) ───────────────────────────────────────────────────

declare global {
  var __s3Client: S3Client | undefined
  var __s3BucketReady: Promise<void> | undefined
}

function bucket(): string {
  return process.env.S3_BUCKET || "educonnect"
}

function s3(): S3Client {
  if (globalThis.__s3Client) return globalThis.__s3Client
  const endpoint = process.env.S3_ENDPOINT // ex.: http://minio:9000
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: endpoint || undefined,
    // MinIO exige path-style (bucket no caminho, não no subdomínio).
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
  })
  globalThis.__s3Client = client
  return client
}

export async function checkStorageReady(): Promise<void> {
  if (isUploadSimulator()) return
  await s3().send(new HeadBucketCommand({ Bucket: bucket() }))
}

async function ensureBucket(): Promise<void> {
  if (globalThis.__s3BucketReady) return globalThis.__s3BucketReady
  globalThis.__s3BucketReady = (async () => {
    const client = s3()
    const Bucket = bucket()
    try {
      await client.send(new HeadBucketCommand({ Bucket }))
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket }))
      } catch {
        // corrida/permissão: se já existir, segue; erro real aparece no put/get.
      }
    }
  })()
  return globalThis.__s3BucketReady
}

async function toBuffer(
  body: File | Blob | ArrayBuffer | ReadableStream | Buffer
): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer())
  }
  // ReadableStream (web)
  const chunks: Uint8Array[] = []
  const reader = (body as ReadableStream<Uint8Array>).getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

// ─── put ────────────────────────────────────────────────────────────────────

export type PutOptions = {
  access?: "public" | "private"
  token?: string
  contentType?: string
}

export type PutResult = {
  pathname: string
  url: string
  downloadUrl: string
  contentType: string
  size: number
  uploadedAt: Date
}

export async function put(
  pathname: string,
  body: File | Blob | ArrayBuffer | ReadableStream | Buffer,
  options?: PutOptions
): Promise<PutResult> {
  const buffer = await toBuffer(body)
  const contentType = options?.contentType ?? "application/octet-stream"
  await scanUploadBuffer(buffer)

  if (isUploadSimulator()) {
    const filePath = simFilePath(pathname)
    fs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buffer)
  } else {
    await ensureBucket()
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: pathname,
        Body: buffer,
        ContentType: contentType,
      })
    )
  }

  return {
    pathname,
    url: pathname,
    downloadUrl: pathname,
    contentType,
    size: buffer.length,
    uploadedAt: new Date(),
  }
}

// ─── get ────────────────────────────────────────────────────────────────────

export type GetOptions = { access?: "public" | "private"; token?: string }

export type GetResult = {
  pathname: string
  contentType: string
  size: number
  stream: ReadableStream<Uint8Array>
  headers: Headers
} | null

export async function get(pathname: string, _options?: GetOptions): Promise<GetResult> {
  const key = keyFromRef(pathname)

  if (isUploadSimulator()) {
    const filePath = simFilePath(key)
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
    return { pathname: key, contentType: "application/octet-stream", size: stat.size, stream, headers }
  }

  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
    if (!res.Body) return null
    const contentType = res.ContentType ?? "application/octet-stream"
    const size = Number(res.ContentLength ?? 0)
    const nodeStream = res.Body as Readable
    const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>
    const headers = new Headers({
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    })
    if (size > 0) headers.set("content-length", String(size))
    return { pathname: key, contentType, size, stream, headers }
  } catch {
    return null
  }
}

// ─── del ────────────────────────────────────────────────────────────────────

export type DelOptions = { token?: string }

export async function del(url: string | string[], _options?: DelOptions): Promise<void> {
  const refs = Array.isArray(url) ? url : [url]
  for (const ref of refs) {
    const key = keyFromRef(ref)
    if (!key) continue
    try {
      if (isUploadSimulator()) {
        const filePath = simFilePath(key)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } else {
        await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
      }
    } catch {
      // best-effort
    }
  }
}

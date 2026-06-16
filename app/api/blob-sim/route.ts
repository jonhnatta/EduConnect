/**
 * Serve arquivos do simulador de upload (/tmp/blob-sim/).
 * Ativo apenas quando UPLOAD_SIMULATOR=true.
 * Requer autenticação — não expõe arquivos publicamente.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthedUser } from "@/lib/auth/user"
import { isUploadSimulator } from "@/lib/blob"
import fs from "fs"
import nodePath from "path"

export const runtime = "nodejs"

const SIM_DIR = "/tmp/blob-sim"

function simFilePath(pathname: string): string {
  const safe = pathname.replace(/\.\./g, "_").replace(/^\/+/, "")
  return nodePath.join(SIM_DIR, safe)
}

export async function GET(request: NextRequest) {
  if (!isUploadSimulator()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 })
  }

  const user = await getAuthedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const pathname = request.nextUrl.searchParams.get("pathname")
  const filenameParam = request.nextUrl.searchParams.get("filename")

  if (!pathname || pathname.includes("..")) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  const filePath = simFilePath(pathname)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const buffer = fs.readFileSync(filePath)
  const ext = nodePath.extname(pathname).slice(1).toLowerCase()

  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  }
  const contentType = mimeMap[ext] ?? "application/octet-stream"

  const friendly = filenameParam
    ? filenameParam.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)
    : nodePath.basename(pathname)

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(buffer.length),
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(friendly)}`,
      "cache-control": "private, max-age=3600",
    },
  })
}

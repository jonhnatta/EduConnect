import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db/query"
import { checkStorageReady } from "@/lib/blob"
import { pingClamav } from "@/lib/security/clamav"
import { pingRedis } from "@/lib/redis/health"
import { assertProductionConfig } from "@/lib/config/production"
import { checkAiDependenciesReady } from "@/lib/ai/health"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      assertProductionConfig()
      if (process.env.MALWARE_SCAN_ENABLED !== "true") throw new Error("malware scan disabled")
    }
    const row = await queryOne<{
      users: string | null
      migrations: string | null
      current: boolean
      queue_services_ready: boolean
    }>(
      `select to_regclass('public.users')::text as users,
              to_regclass('public.schema_migrations')::text as migrations,
              exists (select 1 from public.schema_migrations where version = '00570') as current,
              (
                select count(*) = 2
                  from public.service_heartbeats
                 where service_name in ('dispatcher', 'worker')
                   and status = 'ready'
                   and heartbeat_at > timezone('utc'::text, now()) - interval '30 seconds'
              ) as queue_services_ready`
    )
    if (!row?.users || !row.migrations || !row.current || !row.queue_services_ready) {
      throw new Error("runtime unavailable")
    }
    await Promise.all([
      checkStorageReady(),
      pingClamav(),
      pingRedis(process.env.REDIS_QUEUE_URL!),
      pingRedis(process.env.REDIS_CACHE_URL!),
      checkAiDependenciesReady(),
    ])

    return NextResponse.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json(
      { status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}

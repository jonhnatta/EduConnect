import { notFound } from "next/navigation"
import { requireApprovedProfessorAccess } from "@/lib/auth/guards"
import { requireDefaultCopilotAccess } from "@/lib/ai/copilot/runtime"
import { CopilotClient } from "./copilot-client"

export const dynamic = "force-dynamic"

export default async function ProfessorCopilotPage() {
  const { userId } = await requireApprovedProfessorAccess()
  await requireDefaultCopilotAccess(userId).catch(() => notFound())

  return <CopilotClient />
}

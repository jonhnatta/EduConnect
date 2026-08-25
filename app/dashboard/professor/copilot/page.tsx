import { requireProfessorAccess } from "@/lib/auth/guards"
import { CopilotClient } from "./copilot-client"

export const dynamic = "force-dynamic"

export default async function ProfessorCopilotPage() {
  await requireProfessorAccess()

  return <CopilotClient />
}

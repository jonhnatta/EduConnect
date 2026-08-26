import { CriarConteudoClient } from "./criar-conteudo-client"
import { requireApprovedProfessorAccess } from "@/lib/auth/guards"
import { listMyContentItemsForProfessor } from "@/app/actions/content-items"

export default async function CriarConteudoPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  await requireApprovedProfessorAccess()

  const { edit } = await searchParams
  const sources = await listMyContentItemsForProfessor()
  return <CriarConteudoClient initialEditId={edit ?? null} initialAuthorizedSources={sources.map(({ id, title, type, status, disciplina }) => ({ id, title, type, status, disciplina }))} />
}

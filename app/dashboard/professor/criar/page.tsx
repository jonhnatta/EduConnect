import { CriarConteudoClient } from "./criar-conteudo-client"
import { requireApprovedProfessorAccess } from "@/lib/auth/guards"

export default async function CriarConteudoPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  await requireApprovedProfessorAccess()

  const { edit } = await searchParams
  return <CriarConteudoClient initialEditId={edit ?? null} />
}

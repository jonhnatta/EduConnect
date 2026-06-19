import { redirect } from "next/navigation"

// "Meus conteúdos" foi incorporado ao perfil do professor (Minhas publicações).
export default function ProfessorConteudosRedirect() {
  redirect("/dashboard/professor/perfil")
}

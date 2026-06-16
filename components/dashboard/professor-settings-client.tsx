"use client"

import { useState, type ComponentType } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Bell, Bot, Globe, Settings2, ShieldCheck, Users } from "lucide-react"

type ProfessorSettingsClientProps = {
  fullName: string
  email: string
  verificationStatus: string | null
  profileVisibility: "public" | "private"
}

function SettingRow({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
          <Icon className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  )
}

export function ProfessorSettingsClient({
  fullName,
  email,
  verificationStatus,
  profileVisibility,
}: ProfessorSettingsClientProps) {
  const [reviewBeforePublish, setReviewBeforePublish] = useState(true)
  const [studentSubmissionAlerts, setStudentSubmissionAlerts] = useState(true)
  const [publicProfile, setPublicProfile] = useState(profileVisibility === "public")
  const [weeklyDigest, setWeeklyDigest] = useState(true)
  const [classroomAnnouncements, setClassroomAnnouncements] = useState(true)

  const approvalLabel =
    verificationStatus === "approved"
      ? "Aprovado"
      : verificationStatus === "pending"
      ? "Em analise"
      : "Nao enviado"

  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#1D4ED8]">
            Preferencias do professor
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Configuracoes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ajuste como voce publica conteudos, recebe alertas e apresenta seu perfil.
          </p>
        </div>
        <Button className="bg-[#1D4ED8] hover:bg-[#1E3A8A]">Salvar preferencias</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Conta profissional</CardTitle>
              <CardDescription>Identidade, aprovacao e visibilidade da sua presenca publica.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Nome</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{fullName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Email</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{email}</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Status da verificacao</p>
                  <p className="mt-1 text-sm text-gray-500">Usado para liberar publicacao e recursos avancados.</p>
                </div>
                <Badge className={verificationStatus === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                  {approvalLabel}
                </Badge>
              </div>

              <SettingRow
                icon={Globe}
                title="Perfil publico do professor"
                description="Deixe sua pagina visivel para alunos explorarem sua abordagem, especialidades e conteudos."
                checked={publicProfile}
                onCheckedChange={setPublicProfile}
              />
              <SettingRow
                icon={Bot}
                title="Revisao por IA antes de publicar"
                description="Ative a etapa de qualidade como preferencia padrao no fluxo de criacao de conteudo."
                checked={reviewBeforePublish}
                onCheckedChange={setReviewBeforePublish}
              />
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Alertas e operacao</CardTitle>
              <CardDescription>Controle o que precisa chegar a voce no momento certo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                icon={Users}
                title="Alertas de entrega dos alunos"
                description="Avisos quando uma atividade receber novas submissoes ou precisar de correcao."
                checked={studentSubmissionAlerts}
                onCheckedChange={setStudentSubmissionAlerts}
              />
              <SettingRow
                icon={Bell}
                title="Resumo semanal"
                description="Receber consolidado com visualizacoes, engajamento e pendencias de sala."
                checked={weeklyDigest}
                onCheckedChange={setWeeklyDigest}
              />
              <SettingRow
                icon={Settings2}
                title="Avisos de anuncios de sala"
                description="Sincronizar lembretes sobre novos materiais, atividades publicadas e atualizacoes internas."
                checked={classroomAnnouncements}
                onCheckedChange={setClassroomAnnouncements}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-lg">Painel rapido</CardTitle>
              <CardDescription className="text-blue-100">
                Estado atual das configuracoes mais sensiveis do seu fluxo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-100">Publicacao</p>
                <p className="mt-2 text-sm font-semibold">
                  {reviewBeforePublish ? "Revisao IA ativada por padrao" : "Publicacao sem revisao automatica"}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-100">Perfil</p>
                <p className="mt-2 text-sm font-semibold">
                  {publicProfile ? "Perfil aberto para descoberta por alunos" : "Perfil privado"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Atalhos uteis</CardTitle>
              <CardDescription>Acesso rapido para areas que conversam com estas preferencias.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/revisoes">Abrir revisoes pela IA</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/notificacoes">Abrir central de notificacoes</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/perfil">Editar perfil publico</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Confianca da conta</CardTitle>
              <CardDescription>Indicadores que afetam a experiencia profissional.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span>Status operacional</span>
                <Badge className="bg-blue-100 text-blue-700">Professor</Badge>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
                <ShieldCheck className="h-4 w-4 text-[#1D4ED8]" />
                <p>Este mockup prepara o terreno para persistir preferencias sem quebrar o padrao existente.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

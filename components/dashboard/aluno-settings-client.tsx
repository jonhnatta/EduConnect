"use client"

import { useState, useTransition, type ComponentType } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Bell, Eye, Globe, Lock, Loader2, Shield, Sparkles } from "lucide-react"
import { updateMySettings, type NotificationPrefs } from "@/app/actions/settings"

type AlunoSettingsClientProps = {
  fullName: string
  email: string
  profileVisibility: "public" | "private"
  notificationPrefs?: NotificationPrefs
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
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <Icon className="h-5 w-5 text-[#10B981]" />
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

export function AlunoSettingsClient({
  fullName,
  email,
  profileVisibility,
  notificationPrefs = {},
}: AlunoSettingsClientProps) {
  const pref = (key: string, fallback = true) =>
    typeof notificationPrefs[key] === "boolean" ? notificationPrefs[key] : fallback
  const [emailAlerts, setEmailAlerts] = useState(pref("emailAlerts"))
  const [classroomAlerts, setClassroomAlerts] = useState(pref("classroomAlerts"))
  const [goalReminders, setGoalReminders] = useState(pref("goalReminders"))
  const [publicProfile, setPublicProfile] = useState(profileVisibility === "public")
  const [mentorSuggestions, setMentorSuggestions] = useState(pref("mentorSuggestions"))
  const [saving, startSaving] = useTransition()

  function handleSave() {
    startSaving(async () => {
      const result = await updateMySettings({
        profileVisibility: publicProfile ? "public" : "private",
        notificationPrefs: { emailAlerts, classroomAlerts, goalReminders, mentorSuggestions },
      })
      if (result.ok) toast.success("Preferencias salvas")
      else toast.error(result.error)
    })
  }

  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-[#059669]">
            Preferencias do aluno
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Configuracoes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ajuste como voce quer acompanhar estudos, perfil publico e lembretes.
          </p>
        </div>
        <Button className="bg-[#10B981] hover:bg-[#059669] gap-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar preferencias
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Conta e perfil</CardTitle>
              <CardDescription>Dados principais da sua conta e visibilidade publica.</CardDescription>
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

              <SettingRow
                icon={Globe}
                title="Perfil publico"
                description="Permita que professores e recrutadores vejam o que voce estuda e seus objetivos."
                checked={publicProfile}
                onCheckedChange={setPublicProfile}
              />
              <SettingRow
                icon={Shield}
                title="Sugestoes do Tutor IA"
                description="Receber orientacoes automaticas com base no seu ritmo e nas materias mais acessadas."
                checked={mentorSuggestions}
                onCheckedChange={setMentorSuggestions}
              />

              <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#10B981]" />
                  <p className="text-sm font-semibold text-gray-900">Melhorar perfil publico</p>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Um perfil completo aumenta a chance de conexao com professores e oportunidades futuras.
                </p>
                <Button asChild variant="outline" className="mt-4 border-emerald-200 bg-white">
                  <Link href="/dashboard/aluno/perfil">Editar meu perfil</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Notificacoes e rotina</CardTitle>
              <CardDescription>Escolha o que merece sua atencao imediata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                icon={Bell}
                title="Alertas por email"
                description="Novas salas, mensagens importantes e atualizacoes do seu plano de estudos."
                checked={emailAlerts}
                onCheckedChange={setEmailAlerts}
              />
              <SettingRow
                icon={Eye}
                title="Avisos de sala"
                description="Receber alertas quando um professor publicar atividade ou material novo."
                checked={classroomAlerts}
                onCheckedChange={setClassroomAlerts}
              />
              <SettingRow
                icon={Lock}
                title="Lembretes de meta diaria"
                description="Ser lembrado quando sua meta diaria estiver atrasada ou incompleta."
                checked={goalReminders}
                onCheckedChange={setGoalReminders}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-[#10B981] to-[#059669] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-lg">Resumo rapido</CardTitle>
              <CardDescription className="text-emerald-50">
                Visao geral do que esta ativo hoje na sua conta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Visibilidade</p>
                <p className="mt-2 text-sm font-semibold">
                  {publicProfile ? "Perfil aberto para visualizacao publica" : "Perfil visivel apenas para voce"}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Lembretes</p>
                <p className="mt-2 text-sm font-semibold">
                  {goalReminders ? "Metas diarias ativas" : "Metas diarias silenciosas"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Atalhos uteis</CardTitle>
              <CardDescription>Acesse areas relacionadas sem sair do fluxo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/aluno/progresso">Ver meu progresso</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/aluno/notificacoes">Abrir central de notificacoes</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/aluno/plano">Ir para plano de estudos</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Privacidade</CardTitle>
              <CardDescription>Como sua conta aparece para outras pessoas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span>Modo atual do perfil</span>
                <Badge className={publicProfile ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"}>
                  {publicProfile ? "Publico" : "Privado"}
                </Badge>
              </div>
              <p>
                Suas preferencias sao salvas na sua conta ao clicar em &quot;Salvar preferencias&quot;.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

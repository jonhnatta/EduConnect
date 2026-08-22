"use client"

import { useState, useTransition, type ComponentType } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Download, Globe, KeyRound, Loader2, Trash2, Users } from "lucide-react"
import { updateMySettings, type NotificationPrefs } from "@/app/actions/settings"
import { changePassword, deleteAccount } from "@/app/actions/account"

type ProfessorSettingsClientProps = {
  fullName: string
  email: string
  verificationStatus: string | null
  profileVisibility: "public" | "private"
  notificationPrefs?: NotificationPrefs
  hasPassword?: boolean
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
  notificationPrefs = {},
  hasPassword = false,
}: ProfessorSettingsClientProps) {
  const pref = (key: string, fallback = true) =>
    typeof notificationPrefs[key] === "boolean" ? notificationPrefs[key] : fallback
  const [studentSubmissionAlerts, setStudentSubmissionAlerts] = useState(pref("studentSubmissionAlerts"))
  const [publicProfile, setPublicProfile] = useState(profileVisibility === "public")
  const [saving, startSaving] = useTransition()
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [changingPwd, startChangingPwd] = useTransition()
  const [deletePwd, setDeletePwd] = useState("")
  const [deleting, startDeleting] = useTransition()
  const [showDeleteForm, setShowDeleteForm] = useState(false)
  const router = useRouter()

  function handleSave() {
    startSaving(async () => {
      const result = await updateMySettings({
        profileVisibility: publicProfile ? "public" : "private",
        notificationPrefs: {
          studentSubmissionAlerts,
        },
      })
      if (result.ok) toast.success("Preferencias salvas")
      else toast.error(result.error)
    })
  }

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
        <Button className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar preferencias
        </Button>
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
                  Publicacao direta, sem revisao automatica
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
                <Link href="/dashboard/professor/notificacoes">Abrir central de notificacoes</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/perfil">Editar perfil publico</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#1D4ED8]" />
                Trocar senha
              </CardTitle>
              <CardDescription>Altere a senha da sua conta a qualquer momento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="password"
                placeholder="Senha atual"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoComplete="current-password"
              />
              <Input
                type="password"
                placeholder="Nova senha (min. 8 caracteres)"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoComplete="new-password"
              />
              <Input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
              />
              <Button
                className="w-full bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                disabled={changingPwd}
                onClick={() => {
                  if (newPwd !== confirmPwd) { toast.error("As senhas nao coincidem"); return }
                  startChangingPwd(async () => {
                    const r = await changePassword(currentPwd, newPwd)
                    if (r.ok) {
                      toast.success("Senha alterada com sucesso")
                      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("")
                    } else {
                      toast.error(r.error)
                    }
                  })
                }}
              >
                {changingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Alterar senha
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Download className="h-5 w-5" />
                Exportar meus dados
              </CardTitle>
              <CardDescription>Baixe uma copia JSON dos dados associados a sua conta.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <a href="/api/account/export">Baixar meus dados</a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-red-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-red-700 flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Excluir conta
              </CardTitle>
              <CardDescription>Solicitar exclusao permanente (LGPD Art. 18). Seus dados serao removidos em ate 30 dias.</CardDescription>
            </CardHeader>
            <CardContent>
              {!showDeleteForm ? (
                <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 w-full" onClick={() => setShowDeleteForm(true)}>
                  Solicitar exclusao da conta
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 font-medium">
                    Esta acao nao pode ser desfeita.{" "}
                    {hasPassword ? "Confirme com sua senha:" : "Digite seu e-mail para confirmar:"}
                  </p>
                  <Input
                    type={hasPassword ? "password" : "email"}
                    placeholder={hasPassword ? "Sua senha" : email}
                    value={deletePwd}
                    onChange={(e) => setDeletePwd(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setShowDeleteForm(false); setDeletePwd("") }}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-red-600 hover:bg-red-700 gap-2"
                      disabled={deleting}
                      onClick={() => {
                        startDeleting(async () => {
                          const r = await deleteAccount(deletePwd)
                          if (r.ok) {
                            toast.success("Conta marcada para exclusao. Voce sera desconectado.")
                            router.push("/login")
                          } else {
                            toast.error(r.error)
                          }
                        })
                      }}
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Confirmar exclusao
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

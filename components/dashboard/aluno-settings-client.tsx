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
import { Bell, Download, Globe, KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react"
import { updateMySettings, type NotificationPrefs } from "@/app/actions/settings"
import { changePassword, deleteAccount } from "@/app/actions/account"

type AlunoSettingsClientProps = {
  fullName: string
  email: string
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
  hasPassword = false,
}: AlunoSettingsClientProps) {
  const pref = (key: string, fallback = true) =>
    typeof notificationPrefs[key] === "boolean" ? notificationPrefs[key] : fallback
  const [newContentAlerts, setNewContentAlerts] = useState(pref("new_content"))
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
        notificationPrefs: { new_content: newContentAlerts },
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
                title="Novos conteudos"
                description="Receber uma notificacao quando um professor seguido publicar conteudo."
                checked={newContentAlerts}
                onCheckedChange={setNewContentAlerts}
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
                <p className="text-xs uppercase tracking-wide text-emerald-100">Notificacoes</p>
                <p className="mt-2 text-sm font-semibold">
                  {newContentAlerts ? "Novos conteudos ativos" : "Novos conteudos silenciados"}
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
              <CardTitle className="font-display text-lg text-gray-900 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#10B981]" />
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
                className="w-full bg-[#10B981] hover:bg-[#059669] gap-2"
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

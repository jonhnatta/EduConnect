"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Camera, Eye, EyeOff, ExternalLink, Loader2, Save, Upload, User, Users } from "lucide-react"
import { uploadProfileImage, updateDashboardProfile, type DashboardProfile } from "@/app/actions/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  BIO_MAX_CHARS,
  EDUCATION_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_OPTIONS,
  STUDY_FOCUS_MAX_CHARS,
} from "@/lib/profile/constants"
import { buildStudentProfilePath, buildTeacherProfilePath } from "@/lib/profile/public"

const SUBJECTS = [
  "Matematica",
  "Fisica",
  "Quimica",
  "Biologia",
  "Historia",
  "Geografia",
  "Portugues",
  "Redacao",
  "Ingles",
  "Filosofia",
  "Sociologia",
  "Programacao",
]

type Theme = {
  roleLabel: string
  accent: string
  accentHover: string
  soft: string
  ring: string
  gradient: string
}

const THEMES: Record<"aluno" | "professor", Theme> = {
  aluno: {
    roleLabel: "Aluno",
    accent: "bg-[#10B981]",
    accentHover: "hover:bg-[#059669]",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-100",
    ring: "focus:ring-[#10B981]",
    gradient: "from-[#10B981] to-[#059669]",
  },
  professor: {
    roleLabel: "Professor",
    accent: "bg-[#1D4ED8]",
    accentHover: "hover:bg-[#1E3A8A]",
    soft: "bg-blue-50 text-blue-700 border-blue-100",
    ring: "focus:ring-[#1D4ED8]",
    gradient: "from-[#1E3A8A] to-[#1D4ED8]",
  },
}

function initials(name: string | null) {
  if (!name) return "U"
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function ProfilePageEditor({
  initialProfile,
  profileType,
  socialStats,
}: {
  initialProfile: DashboardProfile
  profileType: "aluno" | "professor"
  socialStats?: { followersCount: number; followingCount: number }
}) {
  const theme = THEMES[profileType]
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(initialProfile)
  const [fullName, setFullName] = useState(initialProfile.full_name ?? "")
  const [bio, setBio] = useState(initialProfile.bio ?? "")
  const [websiteUrl, setWebsiteUrl] = useState(initialProfile.website_url ?? "")
  const [interests, setInterests] = useState<string[]>(initialProfile.interests ?? [])
  const [slug, setSlug] = useState(initialProfile.slug ?? "")
  const [educationLevel, setEducationLevel] = useState(initialProfile.education_level ?? "")
  const [employmentStatus, setEmploymentStatus] = useState(initialProfile.employment_status ?? "nao_informado")
  const [studyFocus, setStudyFocus] = useState(initialProfile.study_focus ?? "")
  const [isPublic, setIsPublic] = useState(initialProfile.profile_visibility === "public")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null)
  const [isPending, startTransition] = useTransition()
  const publicStudentPath = slug ? buildStudentProfilePath(slug) : null
  const publicTeacherPath = profileType === "professor" && slug ? buildTeacherProfilePath(slug) : null

  function notifyProfileUpdated() {
    window.dispatchEvent(new CustomEvent("profile:updated"))
  }

  function toggleInterest(item: string) {
    setInterests((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    )
  }

  async function uploadImage(kind: "avatar" | "cover", file: File | null | undefined) {
    if (!file) return
    setError(null)
    setMessage(null)
    setUploading(kind)
    const formData = new FormData()
    formData.append("file", file)
    const result = await uploadProfileImage(kind, formData)
    setUploading(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setProfile((current) => ({
      ...current,
      avatar_url: kind === "avatar" ? result.url : current.avatar_url,
      cover_url: kind === "cover" ? result.url : current.cover_url,
    }))
    setMessage(kind === "avatar" ? "Foto de perfil atualizada" : "Imagem de capa atualizada")
    notifyProfileUpdated()
  }

  function saveProfile() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateDashboardProfile({
        fullName,
        bio,
        websiteUrl,
        interests,
        slug,
        educationLevel: educationLevel || null,
        employmentStatus: employmentStatus || null,
        studyFocus,
        profileVisibility: isPublic ? "public" : "private",
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Re-sincroniza os campos com o que o servidor normalizou (trim, dedupe, etc.).
      setProfile(result.profile)
      setFullName(result.profile.full_name ?? "")
      setBio(result.profile.bio ?? "")
      setWebsiteUrl(result.profile.website_url ?? "")
      setInterests(result.profile.interests ?? [])
      setSlug(result.profile.slug ?? "")
      setEducationLevel(result.profile.education_level ?? "")
      setEmploymentStatus(result.profile.employment_status ?? "nao_informado")
      setStudyFocus(result.profile.study_focus ?? "")
      setIsPublic(result.profile.profile_visibility === "public")
      setMessage("Perfil salvo")
      notifyProfileUpdated()
    })
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-gray-900">Meu Perfil</h1>
        <p className="text-gray-600">Edite como sua identidade aparece na EduConnect.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
        <div className={cn("relative h-48 md:h-64 bg-gradient-to-r", theme.gradient)}>
          {profile.cover_url ? (
            <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-black/10" />
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => uploadImage("cover", event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            className="absolute right-4 bottom-4 gap-2 bg-white/95 hover:bg-white"
            disabled={uploading === "cover"}
            onClick={() => coverInputRef.current?.click()}
          >
            {uploading === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Alterar capa
          </Button>
        </div>

        <div className="px-4 sm:px-6 pb-6">
          {/* Linha 1: avatar (sobrepõe a capa) + botão salvar — sem texto aqui */}
          <div className="flex items-end justify-between -mt-14 sm:-mt-16">
            <div className="relative w-fit">
              <Avatar className="h-28 w-28 sm:h-36 sm:w-36 border-4 border-white shadow-sm">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className={cn("text-white text-3xl", theme.accent)}>
                  {initials(fullName)}
                </AvatarFallback>
              </Avatar>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => uploadImage("avatar", event.target.files?.[0])}
              />
              <button
                type="button"
                className="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50"
                disabled={uploading === "avatar"}
                onClick={() => avatarInputRef.current?.click()}
                aria-label="Alterar foto de perfil"
              >
                {uploading === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </button>
            </div>

            <Button
              type="button"
              className={cn("gap-2 text-white mb-1", theme.accent, theme.accentHover)}
              disabled={isPending}
              onClick={saveProfile}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar perfil
            </Button>
          </div>

          {/* Linha 2: badges, nome e estatísticas — totalmente na área branca */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", theme.soft)}>
                <User className="h-3.5 w-3.5 mr-1.5" />
                {theme.roleLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                {isPublic ? <Eye className="h-3.5 w-3.5 mr-1.5" /> : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
                {isPublic ? "Publico" : "Privado"}
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold text-gray-900">{fullName || "Seu nome"}</h2>
            {socialStats ? (
              <div className="flex items-center gap-5 mt-2">
                {/* Mostra só a métrica relevante ao papel: professor é seguido; aluno segue. */}
                <div className="text-center">
                  <p className="font-display font-bold text-lg text-gray-900 leading-tight">
                    {profileType === "professor" ? socialStats.followersCount : socialStats.followingCount}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 justify-center">
                    <Users className="h-3 w-3" />
                    {profileType === "professor" ? "seguidores" : "seguindo"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Perfil pessoal na EduConnect</p>
            )}
          </div>

          {message ? (
            <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="font-display font-semibold text-gray-900">Informacoes principais</h3>
            <p className="text-sm text-gray-500">Esses dados aparecem no seu perfil e nos espacos da plataforma.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Nome</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={cn("h-11", theme.ring)}
              placeholder="Seu nome completo"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="bio">Descricao</Label>
              <span className={cn("text-xs", bio.length > BIO_MAX_CHARS ? "text-red-600" : "text-gray-500")}>
                {bio.length}/{BIO_MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="bio"
              value={bio}
              maxLength={BIO_MAX_CHARS}
              onChange={(event) => setBio(event.target.value)}
              className={cn("min-h-40 resize-none", theme.ring)}
              placeholder="Conte sobre sua trajetoria, objetivos, materias preferidas ou experiencia."
            />
          </div>

          {profileType === "professor" ? (
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Site</Label>
              <Input
                id="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                className={cn("h-11", theme.ring)}
                placeholder="https://seusite.com.br"
              />
              <p className="text-xs text-gray-500">Opcional. Se informado, pode aparecer no seu perfil publico.</p>
            </div>
          ) : null}

          <div className="space-y-3">
            <Label>{profileType === "professor" ? "Disciplinas" : "Interesses"}</Label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((item) => {
                const selected = interests.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleInterest(item)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      selected
                        ? cn("border-transparent text-white", theme.accent)
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {item}
                  </button>
                )
              })}
            </div>
          </div>

          {profileType === "aluno" ? (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="slug">Link publico</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    className={cn("h-11", theme.ring)}
                    placeholder="seu-link-publico"
                  />
                  <p className="text-xs text-gray-500">
                    Use letras minusculas, numeros e hifens.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Escolaridade</Label>
                  <Select value={educationLevel} onValueChange={setEducationLevel}>
                    <SelectTrigger className={cn("h-11 w-full", theme.ring)}>
                      <SelectValue placeholder="Selecione seu nivel atual" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDUCATION_LEVEL_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Situacao profissional</Label>
                  <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
                    <SelectTrigger className={cn("h-11 w-full", theme.ring)}>
                      <SelectValue placeholder="Selecione sua situacao" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {EMPLOYMENT_STATUS_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="studyFocus">Objetivo atual</Label>
                    <span className={cn("text-xs", studyFocus.length > STUDY_FOCUS_MAX_CHARS ? "text-red-600" : "text-gray-500")}>
                      {studyFocus.length}/{STUDY_FOCUS_MAX_CHARS}
                    </span>
                  </div>
                  <Input
                    id="studyFocus"
                    value={studyFocus}
                    maxLength={STUDY_FOCUS_MAX_CHARS}
                    onChange={(event) => setStudyFocus(event.target.value)}
                    className={cn("h-11", theme.ring)}
                    placeholder="Ex.: buscando estagio em desenvolvimento front-end"
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display font-semibold text-gray-900">Visibilidade</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Defina se seu perfil podera ser exibido publicamente.
                </p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            <div className="mt-5 rounded-lg bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                {isPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {isPublic ? "Perfil publico" : "Perfil privado"}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {isPublic
                  ? "Seu perfil fica preparado para paginas publicas e descoberta."
                  : "Seu perfil permanece restrito ao seu uso autenticado."}
              </p>
              {profileType === "aluno" && isPublic && publicStudentPath ? (
                <Link
                  href={publicStudentPath}
                  target="_blank"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Ver pagina publica
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
              {profileType === "professor" && isPublic && publicTeacherPath ? (
                <Link
                  href={publicTeacherPath}
                  target="_blank"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Ver pagina publica
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 sm:p-6">
            <h3 className="font-display font-semibold text-gray-900 mb-3">Previa</h3>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className={cn("h-20 bg-gradient-to-r", theme.gradient)}>
                {profile.cover_url ? <img src={profile.cover_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="p-4 -mt-8">
                <Avatar className="h-16 w-16 border-4 border-white">
                  <AvatarImage src={profile.avatar_url || ""} />
                  <AvatarFallback className={cn("text-white", theme.accent)}>{initials(fullName)}</AvatarFallback>
                </Avatar>
                <div className="mt-3">
                  <p className="font-semibold text-gray-900">{fullName || "Seu nome"}</p>
                  <p className="text-sm text-gray-500 line-clamp-3">{bio || "Sua descricao aparecera aqui."}</p>
                  {profileType === "aluno" && studyFocus ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">{studyFocus}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

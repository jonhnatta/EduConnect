import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getAdminRoleAccess } from "@/lib/auth/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { confirmAdminMfa } from "./actions"

export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await getAdminRoleAccess()
  if (!access) redirect("/login")
  const params = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-white">
        <CardHeader>
          <ShieldCheck className="mb-2 h-10 w-10 text-emerald-400" />
          <CardTitle>Autenticacao administrativa</CardTitle>
          <CardDescription className="text-slate-400">
            Informe o codigo atual do autenticador para {access.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={confirmAdminMfa} className="space-y-4">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="h-12 bg-white text-center text-xl tracking-[0.35em] text-slate-950" />
            {params.error ? <p className="text-sm text-red-400">Codigo invalido ou limite excedido.</p> : null}
            <Button className="h-11 w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">Validar MFA</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cookie } from "lucide-react"
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
} from "@/components/legal/consented-analytics"

const STORAGE_KEY = COOKIE_CONSENT_STORAGE_KEY

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    try {
      const choice = localStorage.getItem(STORAGE_KEY)
      if (!choice) timer = window.setTimeout(() => setVisible(true), 0)
    } catch {
      // localStorage indisponível (modo privado): não bloqueia o uso.
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  function decide(choice: "accepted" | "rejected") {
    try {
      localStorage.setItem(STORAGE_KEY, choice)
      localStorage.setItem(`${STORAGE_KEY}:at`, new Date().toISOString())
      window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT))
    } catch {
      // ignora
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Cookie className="h-5 w-5 text-[#1D4ED8]" />
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Usamos cookies essenciais para o funcionamento e cookies de métricas para melhorar a
            plataforma. Veja a{" "}
            <Link href="/cookies" className="text-[#1D4ED8] underline">
              Política de Cookies
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => decide("rejected")}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Recusar
          </button>
          <button
            onClick={() => decide("accepted")}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E3A8A] transition-colors"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}

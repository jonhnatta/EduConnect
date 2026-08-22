"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"

export const COOKIE_CONSENT_EVENT = "educonnect:cookie-consent-changed"
export const COOKIE_CONSENT_STORAGE_KEY = "educonnect:cookie-consent"

export function ConsentedAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const refresh = () => {
      try {
        setEnabled(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) === "accepted")
      } catch {
        setEnabled(false)
      }
    }
    refresh()
    window.addEventListener(COOKIE_CONSENT_EVENT, refresh)
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, refresh)
  }, [])

  return enabled ? <Analytics /> : null
}

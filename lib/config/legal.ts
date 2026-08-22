export type LegalConfig = {
  controllerName: string
  controllerId: string
  controllerAddress: string
  dpoName: string
  privacyEmail: string
  supportEmail: string
  forum: string
  hostingProvider: string
}

export const TERMS_VERSION = "2026-07-16"
export const PRIVACY_VERSION = "2026-07-16"

function value(name: string): string {
  return process.env[name]?.trim() || "Configuração obrigatória pendente"
}

export function legalConfig(): LegalConfig {
  return {
    controllerName: value("LEGAL_CONTROLLER_NAME"),
    controllerId: value("LEGAL_CONTROLLER_ID"),
    controllerAddress: value("LEGAL_CONTROLLER_ADDRESS"),
    dpoName: value("LEGAL_DPO_NAME"),
    privacyEmail: value("LEGAL_PRIVACY_EMAIL"),
    supportEmail: value("LEGAL_SUPPORT_EMAIL"),
    forum: value("LEGAL_FORUM"),
    hostingProvider: value("LEGAL_HOSTING_PROVIDER"),
  }
}

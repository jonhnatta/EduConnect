import type { Metadata } from 'next'
import { Sora, DM_Sans, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { AuthSessionProvider } from "@/components/auth/session-provider"
import { CookieConsent } from "@/components/legal/cookie-consent"
import './globals.css'

const sora = Sora({ 
  subsets: ["latin"],
  variable: '--font-sora',
  display: 'swap',
})

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  variable: '--font-dm-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EduConnect - Ensinar é uma arte. Aprender é uma jornada.',
  description: 'Plataforma educacional social com IA integrada, conectando professores e alunos em um ecossistema de aprendizado inteligente.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${sora.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  )
}

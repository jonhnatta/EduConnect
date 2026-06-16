import Link from "next/link"
import { GraduationCap } from "lucide-react"

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold text-gray-900">EduConnect</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/termos" className="hover:text-[#1D4ED8]">Termos</Link>
            <Link href="/privacidade" className="hover:text-[#1D4ED8]">Privacidade</Link>
            <Link href="/cookies" className="hover:text-[#1D4ED8]">Cookies</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <article
          className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-10 text-gray-700 leading-relaxed
          [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-2
          [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-3
          [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-5 [&_h3]:mb-2
          [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1
          [&_a]:text-[#1D4ED8] [&_a]:underline [&_strong]:text-gray-900
          [&_table]:w-full [&_table]:my-4 [&_th]:text-left [&_th]:p-2 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50
          [&_td]:p-2 [&_td]:border [&_td]:border-gray-200 [&_td]:align-top"
        >
          {children}
        </article>
      </main>
    </div>
  )
}

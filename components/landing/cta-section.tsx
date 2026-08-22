import Link from "next/link"
import { Button } from "@/components/ui/button"
import { GraduationCap, BookOpen, ArrowRight } from "lucide-react"

export function CTASection() {
  return (
    <section className="py-20 lg:py-32 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8] px-8 py-16 lg:px-16 lg:py-24">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-white rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          </div>
          
          <div className="relative text-center">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white max-w-3xl mx-auto text-balance">
              Comece hoje, é gratuito
            </h2>
            <p className="mt-6 text-lg text-blue-100 max-w-2xl mx-auto">
              Organize conteúdos, turmas e atividades em um único lugar. Crie sua conta
              gratuita e comece a usar a plataforma.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-white text-[#1D4ED8] hover:bg-blue-50 font-semibold h-14 px-8 text-base"
              >
                <Link href="/cadastro?tipo=professor">
                  <BookOpen className="mr-2 h-5 w-5" />
                  Cadastrar como Professor
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                variant="outline" 
                className="border-2 border-white bg-transparent text-white hover:bg-white/10 font-semibold h-14 px-8 text-base"
              >
                <Link href="/cadastro?tipo=aluno">
                  <GraduationCap className="mr-2 h-5 w-5" />
                  Cadastrar como Aluno
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            
            <p className="mt-6 text-sm text-blue-200">
              Sem cartão de crédito. O primeiro lançamento é gratuito.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

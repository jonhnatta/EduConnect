"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { GraduationCap, BookOpen, Sparkles, Users } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#1E3A8A] to-[#1D4ED8] text-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
      </div>
      
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
          {/* Text Content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm mb-6">
              <Sparkles className="h-4 w-4 text-yellow-300" />
              <span>Ensino e aprendizagem conectados</span>
            </div>
            
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-balance">
              A plataforma onde professores ensinam e alunos evoluem
            </h1>
            
            <p className="mt-6 text-lg text-blue-100 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Publique conteúdo, gerencie suas turmas e acompanhe a evolução dos alunos.
              Organize estudos, atividades e materiais em um único lugar.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button 
                asChild 
                size="lg" 
                className="bg-white text-[#1D4ED8] hover:bg-blue-50 font-semibold h-14 px-8 text-base"
              >
                <Link href="/cadastro?tipo=professor">
                  <BookOpen className="mr-2 h-5 w-5" />
                  Sou Professor
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
                  Sou Aluno
                </Link>
              </Button>
            </div>
            
            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-8 border-t border-white/20 pt-8">
              <div>
                <div className="text-xl font-bold font-display">Gratuito</div>
                <div className="text-sm text-blue-200">no lancamento</div>
              </div>
              <div>
                <div className="text-xl font-bold font-display">Turmas</div>
                <div className="text-sm text-blue-200">organizadas</div>
              </div>
              <div>
                <div className="text-xl font-bold font-display">Conteudos</div>
                <div className="text-sm text-blue-200">em um so lugar</div>
              </div>
            </div>
          </div>
          
          {/* Visual */}
          <div className="relative hidden lg:block">
            <div className="relative mx-auto w-full max-w-lg">
              {/* Main Card */}
              <div className="rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#10B981] flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-gray-900">Turma de Matematica</div>
                    <div className="text-sm text-gray-500">Nova atividade publicada</div>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
                    Equacoes do 2 grau: conceitos e exemplos
                  </div>
                  <div className="rounded-lg bg-[#1D4ED8] p-3 text-sm text-white">
                    Material, exercicios e prazo reunidos para a turma.
                  </div>
                </div>
              </div>
              
              {/* Floating Cards */}
              <div className="absolute -top-4 -right-4 rounded-xl bg-[#10B981] p-4 text-white shadow-lg">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <span className="font-semibold">+28 alunos</span>
                </div>
                <div className="text-xs text-green-100 mt-1">entraram esta semana</div>
              </div>
              
              <div className="absolute -bottom-4 -left-4 rounded-xl bg-[#F59E0B] p-4 text-white shadow-lg">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  <span className="font-semibold">Atividade pronta!</span>
                </div>
                <div className="text-xs text-yellow-100 mt-1">Disponivel para a turma</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

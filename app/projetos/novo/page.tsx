import { NewProjectForm } from '@/components/upload/NewProjectForm'
import Link from 'next/link'
import { Building2, ArrowLeft } from 'lucide-react'

export default function NovoProjeto() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="border-b border-[var(--border-base)] bg-[var(--bg-base)]/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg tracking-tight">Metodo Engenharia</span>
          </Link>
          <span className="text-[var(--border-base)]">/</span>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Novo Projeto</h1>
          <p className="text-[var(--fg-muted)] text-sm">
            Preencha os dados do projeto e faça upload do edital para começar a análise com IA
          </p>
        </div>
        <NewProjectForm />
      </main>
    </div>
  )
}

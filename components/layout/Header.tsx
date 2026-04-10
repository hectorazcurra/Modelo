import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#2A2A2A] bg-[#0A0A0A]/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-black" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-lg tracking-tight">Modelo</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-[#A3A3A3] hover:text-[#FAFAFA] transition-colors">
            Dashboard
          </Link>
          <Link href="/projetos/novo" className="text-sm text-[#A3A3A3] hover:text-[#FAFAFA] transition-colors">
            Novo Projeto
          </Link>
        </nav>

        <Button href="/dashboard" size="sm">Acessar</Button>
      </div>
    </header>
  )
}

import { Header } from '@/components/layout/Header'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { CTA } from '@/components/landing/CTA'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0A]">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <CTA />
      </main>
      <footer className="border-t border-[#2A2A2A] py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#A3A3A3]">
            © 2025 Modelo. Plataforma de orçamentos para obras públicas.
          </p>
          <p className="text-xs text-[#666666]">
            Desenvolvido por Nato Digital
          </p>
        </div>
      </footer>
    </div>
  )
}

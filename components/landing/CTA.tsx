import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CTA() {
  return (
    <section className="py-20 px-6 border-t border-[#2A2A2A]">
      <div className="max-w-3xl mx-auto text-center">
        <div className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent p-12 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5 pointer-events-none" />

          <h2 className="text-3xl md:text-4xl font-bold mb-4 relative">
            Pronto para otimizar seus orçamentos?
          </h2>
          <p className="text-[#A3A3A3] text-lg mb-8 relative">
            Comece agora criando seu primeiro projeto e faça upload do edital.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
            <Button href="/dashboard" size="lg" className="text-base px-8">
              Ir para o Dashboard
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

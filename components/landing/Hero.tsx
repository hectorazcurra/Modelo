import { ArrowRight, FileText, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-20 px-6">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Amber glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-400 mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          <span>IA integrada com Claude e GPT-4o</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-none">
          Orçamentos de obras{' '}
          <span className="text-amber-400">inteligentes</span>
        </h1>

        <p className="text-lg md:text-xl text-[var(--fg-muted)] max-w-2xl mx-auto mb-10 leading-relaxed">
          Importe editais de licitação em PDF, deixe a IA analisar os requisitos e gere orçamentos
          detalhados com custo por m², mão de obra e cronograma.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/dashboard" size="lg" className="text-base px-8">
            Acessar Dashboard
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button href="/projetos/novo" size="lg" variant="outline" className="text-base px-8">
            <FileText className="w-4 h-4" />
            Novo Projeto
          </Button>
        </div>

        {/* Preview image placeholder */}
        <div className="mt-16 relative">
          <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl shadow-black/50">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-base)] bg-[var(--bg-base)]">
              <div className="w-3 h-3 rounded-full bg-[var(--border-base)]" />
              <div className="w-3 h-3 rounded-full bg-[var(--border-base)]" />
              <div className="w-3 h-3 rounded-full bg-[var(--border-base)]" />
              <div className="flex-1 mx-4 h-6 rounded bg-[var(--bg-elev)] border border-[var(--border-base)]" />
            </div>

            {/* Fake split screen */}
            <div className="flex h-64 md:h-80">
              <div className="w-2/5 border-r border-[var(--border-base)] p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="h-2 bg-[var(--border-base)] rounded w-3/4" />
                    <div className="h-2 bg-[var(--border-base)] rounded w-full" />
                    <div className="h-2 bg-[var(--border-base)] rounded w-5/6" />
                  </div>
                </div>
                <div className="flex items-start gap-2 self-end flex-row-reverse">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="h-2 bg-[var(--bg-elev)] rounded w-2/3" />
                    <div className="h-2 bg-[var(--bg-elev)] rounded w-1/2" />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="h-2 bg-[var(--border-base)] rounded w-full" />
                    <div className="h-2 bg-[var(--border-base)] rounded w-3/4" />
                    <div className="h-2 bg-[var(--border-base)] rounded w-2/3" />
                    <div className="h-2 bg-[var(--border-base)] rounded w-5/6" />
                  </div>
                </div>
                <div className="mt-auto h-8 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)]" />
              </div>
              <div className="flex-1 p-4 space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-3 bg-amber-500/30 rounded w-32" />
                  <div className="h-5 px-2 rounded-full bg-green-500/20 border border-green-500/30 w-20" />
                </div>
                {[85, 60, 95, 40, 70].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-2 bg-[var(--bg-elev)] rounded w-24 flex-shrink-0" />
                    <div
                      className="h-2 bg-[var(--border-base)] rounded"
                      style={{ width: `${w}%` }}
                    />
                    <div className="h-2 bg-amber-500/40 rounded w-16 flex-shrink-0" />
                  </div>
                ))}
                <div className="pt-2 border-t border-[var(--border-base)]">
                  <div className="flex justify-between">
                    <div className="h-3 bg-[var(--border-base)] rounded w-24" />
                    <div className="h-3 bg-amber-500/60 rounded w-28" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Gradient fade */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--bg-base)] to-transparent" />
        </div>
      </div>
    </section>
  )
}

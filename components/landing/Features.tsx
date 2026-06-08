import { FileSearch, Brain, LayoutPanelLeft, TrendingUp, Clock, CheckCircle } from 'lucide-react'

const features = [
  {
    icon: FileSearch,
    title: 'Importação de Editais',
    description:
      'Faça upload de editais de obras públicas em PDF. A IA extrai automaticamente todos os requisitos, especificações e condições.',
  },
  {
    icon: Brain,
    title: 'Análise por IA',
    description:
      'Claude ou GPT-4o analisam o edital, comparam com obras anteriores e calculam custos baseados em tabelas SINAPI e composições próprias.',
  },
  {
    icon: LayoutPanelLeft,
    title: 'Interface Split-Screen',
    description:
      'Chat com a IA no painel esquerdo enquanto o orçamento é atualizado em tempo real no painel direito. Interação natural e eficiente.',
  },
  {
    icon: TrendingUp,
    title: 'Base de Conhecimento',
    description:
      'Alimentada por projetos anteriores da empresa. A IA aprende com o histórico para fazer estimativas cada vez mais precisas.',
  },
  {
    icon: Clock,
    title: 'Cronograma Automático',
    description:
      'Geração automática do cronograma físico-financeiro com fases, percentuais e datas baseados no prazo do edital.',
  },
  {
    icon: CheckCircle,
    title: 'Aprovação e Exportação',
    description:
      'Fluxo de revisão e aprovação do orçamento. Exportação em PDF profissional pronto para submissão na licitação.',
  },
]

export function Features() {
  return (
    <section className="py-20 px-6 border-t border-[var(--border-base)]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Tudo que você precisa para{' '}
            <span className="text-[var(--accent-text)]">vencer licitações</span>
          </h2>
          <p className="text-[var(--fg-muted)] text-lg max-w-xl mx-auto">
            Da leitura do edital à proposta final, em uma única plataforma.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-6 hover:border-amber-500/30 hover:bg-[var(--bg-elev-strong)] transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 group-hover:bg-amber-500/15 transition-colors">
                  <Icon className="w-5 h-5 text-[var(--accent-text)]" />
                </div>
                <h3 className="font-semibold text-[var(--fg-base)] mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

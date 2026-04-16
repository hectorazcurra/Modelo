import { FileSearch, Brain, LayoutPanelLeft, TrendingUp, Clock, CheckCircle } from 'lucide-react'

const features = [
  {
    icon: FileSearch,
    title: 'Importación de Pliegos',
    description:
      'Suba pliegos de obras públicas en PDF. La IA extrae automáticamente todos los requisitos, especificaciones y condiciones.',
  },
  {
    icon: Brain,
    title: 'Análisis con IA',
    description:
      'Claude o GPT-4o analizan el pliego, comparan con obras anteriores y calculan costos basados en tablas de precios y composiciones propias.',
  },
  {
    icon: LayoutPanelLeft,
    title: 'Interfaz Split-Screen',
    description:
      'Chat con la IA en el panel izquierdo mientras el presupuesto se actualiza en tiempo real en el panel derecho. Interacción natural y eficiente.',
  },
  {
    icon: TrendingUp,
    title: 'Base de Conocimiento',
    description:
      'Alimentada por proyectos anteriores de la empresa. La IA aprende del historial para hacer estimaciones cada vez más precisas.',
  },
  {
    icon: Clock,
    title: 'Cronograma Automático',
    description:
      'Generación automática del cronograma físico-financiero con fases, porcentajes y fechas basados en el plazo del pliego.',
  },
  {
    icon: CheckCircle,
    title: 'Aprobación y Exportación',
    description:
      'Flujo de revisión y aprobación del presupuesto. Exportación en PDF profesional listo para presentar en la licitación.',
  },
]

export function Features() {
  return (
    <section className="py-20 px-6 border-t border-[#2A2A2A]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Todo lo que necesitas para{' '}
            <span className="text-amber-400">ganar licitaciones</span>
          </h2>
          <p className="text-[#A3A3A3] text-lg max-w-xl mx-auto">
            Desde la lectura del pliego hasta la propuesta final, en una sola plataforma.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-[#2A2A2A] bg-[#111111] p-6 hover:border-amber-500/30 hover:bg-[#131313] transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 group-hover:bg-amber-500/15 transition-colors">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-semibold text-[#FAFAFA] mb-2">{feature.title}</h3>
                <p className="text-sm text-[#A3A3A3] leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

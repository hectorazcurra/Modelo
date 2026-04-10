import Link from 'next/link'
import { Plus, Building2, FileText, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/db/client'
import { formatCurrency, formatDate, statusLabel, statusColor } from '@/lib/utils'
import type { StatusProjeto } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const projetos = await prisma.projeto.findMany({
    orderBy: { atualizadoEm: 'desc' },
    include: {
      _count: { select: { mensagens: true } },
      orcamento: {
        select: { aprovado: true, dados: true },
      },
    },
  })

  const totalOrcamentos = projetos.filter((p) => p.orcamento).length
  const totalAprovados = projetos.filter((p) => p.orcamento?.aprovado).length
  const totalValor = projetos.reduce((acc, p) => {
    const dados = p.orcamento?.dados as { totalGeral?: number } | null
    return acc + (dados?.totalGeral ?? 0)
  }, 0)

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <header className="border-b border-[#2A2A2A] bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg tracking-tight">Modelo</span>
          </Link>
          <Button href="/projetos/novo" size="sm">
            <Plus className="w-4 h-4" />
            Novo Projeto
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
          <p className="text-[#A3A3A3] text-sm">Gerencie seus projetos e orçamentos</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-400">{projetos.length}</div>
              <div className="text-xs text-[#A3A3A3] mt-0.5">Total de Projetos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-400">{totalOrcamentos}</div>
              <div className="text-xs text-[#A3A3A3] mt-0.5">Com Orçamento</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-400">{totalAprovados}</div>
              <div className="text-xs text-[#A3A3A3] mt-0.5">Aprovados</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-[#FAFAFA]">
                {totalValor > 0 ? formatCurrency(totalValor) : '—'}
              </div>
              <div className="text-xs text-[#A3A3A3] mt-0.5">Valor Total</div>
            </CardContent>
          </Card>
        </div>

        {/* Projects list */}
        {projetos.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-[#2A2A2A] rounded-xl">
            <FileText className="w-10 h-10 text-[#A3A3A3] mx-auto mb-4" />
            <h3 className="font-medium text-[#FAFAFA] mb-2">Nenhum projeto ainda</h3>
            <p className="text-sm text-[#A3A3A3] mb-6">
              Crie seu primeiro projeto e faça upload de um edital de obra
            </p>
            <Button href="/projetos/novo">
              <Plus className="w-4 h-4" />
              Criar Projeto
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {projetos.map((projeto) => {
              const dados = projeto.orcamento?.dados as { totalGeral?: number } | null
              return (
                <Link
                  key={projeto.id}
                  href={`/projetos/${projeto.id}`}
                  className="block group"
                >
                  <div className="rounded-xl border border-[#2A2A2A] bg-[#111111] p-5 hover:border-amber-500/30 hover:bg-[#131313] transition-all flex items-center gap-5">
                    <div className="w-10 h-10 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-amber-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium truncate">{projeto.nome}</span>
                        <Badge className={statusColor(projeto.status as StatusProjeto)}>
                          {statusLabel(projeto.status as StatusProjeto)}
                        </Badge>
                      </div>
                      <div className="text-xs text-[#A3A3A3] flex items-center gap-3">
                        <span>Atualizado {formatDate(projeto.atualizadoEm)}</span>
                        <span>{projeto._count.mensagens} mensagens</span>
                        {projeto.pdfNome && (
                          <span className="text-amber-400/70">{projeto.pdfNome}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {dados?.totalGeral ? (
                        <div className="font-semibold text-amber-400">
                          {formatCurrency(dados.totalGeral)}
                        </div>
                      ) : (
                        <div className="text-xs text-[#666666]">Sem orçamento</div>
                      )}
                      <div className="text-xs text-[#A3A3A3]">
                        {projeto.aiProvider === 'claude' ? 'Claude' : 'GPT-4o'}
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-[#A3A3A3] group-hover:text-amber-400 transition-colors flex-shrink-0" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

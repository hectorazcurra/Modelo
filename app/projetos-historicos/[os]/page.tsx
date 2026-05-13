import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
import { prisma } from '@/lib/db/client'
import { HistoricoDetalheView } from '@/components/orcamento/HistoricoDetalheView'
import type { HistoricoDados } from '@/types'

interface PageProps {
  params: Promise<{ os: string }>
}

export default async function ProjetoHistoricoPage({ params }: PageProps) {
  const { os } = await params
  const osCode = decodeURIComponent(os)

  let dados: HistoricoDados | null = null
  try {
    const rows = await prisma.$queryRaw<Array<{ dados: unknown }>>`
      SELECT dados
      FROM BaseConhecimento
      WHERE tipo = 'projeto_historico'
        AND JSON_EXTRACT(dados, '$.os') = ${osCode}
      LIMIT 1
    `
    if (rows.length) {
      let raw = rows[0].dados
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw) } catch { /* keep as is */ }
      }
      dados = raw as HistoricoDados
    }
  } catch {
    // fall through to notFound
  }

  if (!dados) notFound()

  const titulo = `OS ${osCode}${dados.cliente ? ` — ${dados.cliente}` : ''}`

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      <header className="border-b border-[#2A2A2A] px-6 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-[#A3A3A3] hover:text-[#FAFAFA] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <div className="w-px h-4 bg-[#2A2A2A]" />
        <Link href="/">
          <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
          </div>
        </Link>
        <h1 className="text-sm font-semibold">{titulo}</h1>
      </header>

      <main className="max-w-3xl mx-auto py-8 px-4">
        <div className="rounded-xl border border-[#2A2A2A] bg-[#111111]">
          <div className="px-6 pt-6 pb-4 border-b border-[#2A2A2A]">
            <h2 className="font-bold text-lg">{titulo}</h2>
            {dados.descricao && (
              <p className="text-sm text-[#A3A3A3] mt-1">{dados.descricao}</p>
            )}
          </div>
          <HistoricoDetalheView os={osCode} dados={dados} mode="full" />
        </div>
      </main>
    </div>
  )
}

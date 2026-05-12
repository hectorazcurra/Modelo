import { NextRequest } from 'next/server'
import { streamText, convertToModelMessages } from 'ai'
import { prisma } from '@/lib/db/client'
import { getModel } from '@/lib/ai/providers'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { extractOrcamentoFromText, stripOrcamentoBlock } from '@/lib/ai/analyzer'
import type { AIProvider, OrcamentoDados } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projetoId, messages } = body

    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      include: { orcamento: true },
    })

    if (!projeto) {
      return Response.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const baseReferencia = await prisma.baseConhecimento.findMany({
      where: { tipo: { in: ['custo_m2', 'mao_de_obra', 'projeto_aprovado'] } },
      orderBy: { criadoEm: 'desc' },
      take: 5,
    })

    // Load historicos that have any actual data (folder was found)
    type HistoricoRaw = { titulo: string; dados: string }
    const historicos: HistoricoRaw[] = await prisma.$queryRaw`
      SELECT titulo, dados
      FROM BaseConhecimento
      WHERE tipo = 'projeto_historico'
      AND JSON_EXTRACT(dados, '$.pastaResolvida') IS NOT NULL
      ORDER BY criadoEm DESC
    `
    const historicosFormatted = historicos.map((h) => ({
      titulo: h.titulo,
      dados: typeof h.dados === 'string' ? (JSON.parse(h.dados) as unknown) : h.dados,
    }))

    type TextSection = { textoExtraido?: string } | null
    type PPUCategoria = { nome?: string; total?: number; itens?: unknown[] }

    type HistoricoDados = {
      os?: string
      cliente?: string
      descricao?: string
      produto?: string
      tipologia?: string
      valorOrcado?: number | null
      margem?: number | null
      resultado?: number | null
      statusComercial?: string
      totalGeralPPU?: number | null
      mobilizacao?: number | null
      despesasOperacionais?: number | null
      maoDeObraCategoria?: number | null
      areaM2?: number | null
      revisao?: string | null
      dashboard?: {
        municipio?: string; uf?: string; prazoContrato?: number; prazoUnidade?: string
        precoVenda?: number; custoMaoDeObraDireta?: number; custoTotal?: number
        margemValor?: number; margemPerc?: number; impostos?: number; hhMOD?: number
        areaM2?: number
      } | null
      categorias?: PPUCategoria[] | null
      itens?: Array<{ descricao?: string; unidade?: string; qtd?: number; precoTotal?: number }> | null
      equipes?: Array<{ nome?: string; totalHH?: number; custoTotal?: number; custoPorHH?: number }> | null
      cartaConvite?: TextSection
      suprimentos?: TextSection
      engenharia?: TextSection
      propostas?: TextSection
      outrosOrcamento?: TextSection
    }

    const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    const excerpt = (text: string | undefined, max: number) =>
      text ? text.replace(/\s+/g, ' ').slice(0, max).trim() : null

    function formatHistorico(b: { titulo: string; dados: unknown }): string {
      const d = (b.dados ?? {}) as HistoricoDados
      const lines: string[] = [`### ${b.titulo}`]

      // Meta
      const meta: string[] = []
      if (d.produto) meta.push(`Produto: ${d.produto}`)
      if (d.tipologia) meta.push(`Tipologia: ${d.tipologia}`)
      if (d.statusComercial) meta.push(`Status: ${d.statusComercial}`)
      if (d.dashboard?.municipio) meta.push(`Local: ${d.dashboard.municipio}${d.dashboard.uf ? '/' + d.dashboard.uf : ''}`)
      if (d.dashboard?.prazoContrato) meta.push(`Prazo: ${d.dashboard.prazoContrato} ${d.dashboard.prazoUnidade ?? ''}`)
      if (d.areaM2) meta.push(`Área: ${d.areaM2} m²`)
      if (meta.length) lines.push(meta.join(' | '))

      // Financial summary — cost for company vs price for client
      const fin: string[] = []
      if (d.dashboard?.precoVenda)          fin.push(`Preço cliente: ${brl(d.dashboard.precoVenda)}`)
      if (d.dashboard?.custoMaoDeObraDireta) fin.push(`Custo MOD empresa: ${brl(d.dashboard.custoMaoDeObraDireta)}`)
      if (d.dashboard?.custoTotal)          fin.push(`Custo total: ${brl(d.dashboard.custoTotal)}`)
      if (d.dashboard?.impostos)            fin.push(`Impostos: ${brl(d.dashboard.impostos)}`)
      if (d.dashboard?.margemPerc != null)  fin.push(`Margem: ${(d.dashboard.margemPerc * 100).toFixed(1)}%`)
      else if (d.margem != null)            fin.push(`Margem: ${(d.margem * 100).toFixed(1)}%`)
      if (d.dashboard?.hhMOD)              fin.push(`HH MOD: ${d.dashboard.hhMOD}h`)
      if (typeof d.totalGeralPPU === 'number') fin.push(`Total PPU: ${brl(d.totalGeralPPU)}`)
      if (fin.length) lines.push(fin.join(' | '))

      // PPU categories (Mobilização, Despesas Operacionais, Mão de Obra, etc.)
      if (d.categorias?.length) {
        lines.push('PPU por categoria:')
        for (const cat of d.categorias.slice(0, 8)) {
          if (cat.nome && (cat.total ?? 0) > 0) {
            lines.push(`  - ${cat.nome}: ${brl(cat.total ?? 0)} (${cat.itens?.length ?? 0} itens)`)
          }
        }
      } else if (d.mobilizacao || d.despesasOperacionais || d.maoDeObraCategoria) {
        // Fallback to aggregated values
        if (d.mobilizacao)            lines.push(`  Mobilização/Desmobilização: ${brl(d.mobilizacao)}`)
        if (d.despesasOperacionais)   lines.push(`  Despesas Operacionais: ${brl(d.despesasOperacionais)}`)
        if (d.maoDeObraCategoria)     lines.push(`  Mão de Obra: ${brl(d.maoDeObraCategoria)}`)
      }

      // Team hours (Tarefas sheet)
      if (d.equipes?.length) {
        lines.push('Equipes (horas e custo interno):')
        for (const e of d.equipes.slice(0, 8)) {
          lines.push(`  - ${e.nome ?? ''}: ${e.totalHH ?? 0}h | ${brl(e.custoTotal ?? 0)} | ${brl(e.custoPorHH ?? 0)}/h`)
        }
      }

      // Other Orçamento files (Composição Equipe, etc.)
      const outrosExc = excerpt(d.outrosOrcamento?.textoExtraido, 800)
      if (outrosExc) lines.push(`Composição equipe / outros:\n${outrosExc}`)

      // Carta convite / scope
      const ccExc = excerpt(d.cartaConvite?.textoExtraido, 1200)
      if (ccExc) lines.push(`Escopo (carta convite):\n${ccExc}`)

      // Suprimentos
      const suprExc = excerpt(d.suprimentos?.textoExtraido, 600)
      if (suprExc) lines.push(`Suprimentos/materiais:\n${suprExc}`)

      // Proposta ao cliente
      const propExc = excerpt(d.propostas?.textoExtraido, 600)
      if (propExc) lines.push(`Proposta ao cliente:\n${propExc}`)

      return lines.join('\n')
    }

    const baseTexto = [
      ...baseReferencia.map((b) => `### ${b.titulo}\n${JSON.stringify(b.dados, null, 2)}`),
      ...(historicosFormatted.length > 0
        ? [
            `### Projetos históricos da empresa (${historicosFormatted.length} projetos com dados)`,
            ...historicosFormatted.map(formatHistorico),
          ]
        : []),
    ].join('\n\n')

    const systemPrompt = buildSystemPrompt({
      pdfTexto: projeto.pdfTexto,
      orcamentoAtual: projeto.orcamento?.dados as OrcamentoDados | null,
      baseConhecimento: baseTexto,
    })

    const model = getModel(projeto.aiProvider as AIProvider)

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      onFinish: async ({ text }: { text: string }) => {
        const cleanText = stripOrcamentoBlock(text)

        await prisma.mensagem.create({
          data: {
            projetoId,
            role: 'assistant',
            conteudo: cleanText,
          },
        })

        const orcamentoData = extractOrcamentoFromText(text)
        if (orcamentoData) {
          const existingOrc = await prisma.orcamento.findUnique({ where: { projetoId } })
          const dados = orcamentoData as unknown as Parameters<typeof prisma.orcamento.create>[0]['data']['dados']
          if (existingOrc) {
            await prisma.orcamento.update({
              where: { projetoId },
              data: { dados, versao: { increment: 1 } },
            })
          } else {
            await prisma.orcamento.create({
              data: { projetoId, dados },
            })
          }

          await prisma.projeto.update({
            where: { id: projetoId },
            data: { status: 'ORCAMENTO' },
          })
        }
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro no chat' }, { status: 500 })
  }
}

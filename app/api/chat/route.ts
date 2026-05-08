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
      where: { tipo: { not: 'projeto_historico' } },
      orderBy: { criadoEm: 'desc' },
      take: 5,
    })

    const historicos = await prisma.baseConhecimento.findMany({
      where: { tipo: 'projeto_historico' },
      orderBy: { criadoEm: 'desc' },
      take: 8,
    })

    type HistoricoDados = {
      os?: string
      cliente?: string
      descricao?: string
      produto?: string
      tipologia?: string
      valorOrcado?: number | null
      margem?: number | null
      statusComercial?: string
      totalGeralPPU?: number | null
      revisao?: string | null
      dashboard?: { localidade?: string; prazo?: string; hhTotal?: number } | null
      itens?: Array<{ descricao?: string; unidade?: string; qtd?: number; precoTotal?: number }> | null
      equipes?: Array<{ nome?: string; totalHH?: number; custoTotal?: number; custoPorHH?: number }> | null
      cartaConvite?: { textoExtraido?: string } | null
    }

    function formatHistorico(b: { titulo: string; dados: unknown }): string {
      const d = (b.dados ?? {}) as HistoricoDados
      const lines: string[] = [`### ${b.titulo}`]
      const meta: string[] = []
      if (d.produto) meta.push(`Produto: ${d.produto}`)
      if (d.tipologia) meta.push(`Tipologia: ${d.tipologia}`)
      if (d.statusComercial) meta.push(`Status: ${d.statusComercial}`)
      if (d.dashboard?.localidade) meta.push(`Local: ${d.dashboard.localidade}`)
      if (d.dashboard?.prazo) meta.push(`Prazo: ${d.dashboard.prazo}`)
      if (meta.length) lines.push(meta.join(' | '))

      const fin: string[] = []
      if (typeof d.valorOrcado === 'number') fin.push(`Orçado CSV: R$ ${d.valorOrcado.toLocaleString('pt-BR')}`)
      if (typeof d.totalGeralPPU === 'number') fin.push(`Total PPU: R$ ${d.totalGeralPPU.toLocaleString('pt-BR')}`)
      if (typeof d.margem === 'number') fin.push(`Margem: ${(d.margem * 100).toFixed(1)}%`)
      if (typeof d.dashboard?.hhTotal === 'number') fin.push(`HH total: ${d.dashboard.hhTotal}`)
      if (fin.length) lines.push(fin.join(' | '))

      if (d.equipes?.length) {
        lines.push('Equipes:')
        for (const e of d.equipes.slice(0, 6)) {
          lines.push(
            `  - ${e.nome ?? ''}: ${e.totalHH ?? 0}h, R$ ${(e.custoTotal ?? 0).toLocaleString('pt-BR')} (R$ ${(e.custoPorHH ?? 0).toFixed(2)}/h)`,
          )
        }
      }

      if (d.itens?.length) {
        lines.push(`Itens PPU (${d.itens.length} no total, mostrando primeiros 8):`)
        for (const it of d.itens.slice(0, 8)) {
          lines.push(
            `  - ${it.descricao ?? ''} | ${it.qtd ?? 0} ${it.unidade ?? ''} | R$ ${(it.precoTotal ?? 0).toLocaleString('pt-BR')}`,
          )
        }
      }

      if (d.cartaConvite?.textoExtraido) {
        const excerpt = d.cartaConvite.textoExtraido.replace(/\s+/g, ' ').slice(0, 1200).trim()
        if (excerpt) lines.push(`Escopo (excerto da carta convite):\n${excerpt}${d.cartaConvite.textoExtraido.length > 1200 ? '...' : ''}`)
      }

      return lines.join('\n')
    }

    const baseTexto = [
      ...baseReferencia.map((b) => `### ${b.titulo}\n${JSON.stringify(b.dados, null, 2)}`),
      ...(historicos.length > 0
        ? [
            `### Projetos históricos da empresa (${historicos.length})`,
            ...historicos.map(formatHistorico),
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
      onFinish: async ({ text }) => {
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

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

    const baseConhecimento = await prisma.baseConhecimento.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 10,
    })

    const baseTexto = baseConhecimento
      .map((b) => `### ${b.titulo}\n${JSON.stringify(b.dados, null, 2)}`)
      .join('\n\n')

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

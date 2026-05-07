import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'
import type { OrcamentoDados } from '@/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orcamento = await prisma.orcamento.findUnique({
      where: { projetoId: id },
    })

    if (!orcamento) {
      return Response.json({ error: 'Orçamento não encontrado' }, { status: 404 })
    }

    return Response.json(orcamento)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao buscar orçamento' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { dados, aprovado } = body

    const existing = await prisma.orcamento.findUnique({ where: { projetoId: id } })

    let orcamento
    if (existing) {
      orcamento = await prisma.orcamento.update({
        where: { projetoId: id },
        data: {
          ...(dados && { dados: dados as unknown as Parameters<typeof prisma.orcamento.update>[0]['data']['dados'], versao: { increment: 1 } }),
          ...(aprovado !== undefined && { aprovado }),
        },
      })
    } else {
      orcamento = await prisma.orcamento.create({
        data: {
          projetoId: id,
          dados: dados as unknown as Parameters<typeof prisma.orcamento.create>[0]['data']['dados'],
          aprovado: aprovado ?? false,
        },
      })
    }

    // When approving, save to BaseConhecimento so future AI sessions can learn from it
    if (aprovado === true) {
      const projeto = await prisma.projeto.findUnique({ where: { id } })
      if (projeto) {
        const orcDados = (dados ?? orcamento.dados) as OrcamentoDados
        const titulo = `Projeto aprovado: ${projeto.nome}`

        await prisma.baseConhecimento.deleteMany({
          where: { tipo: 'projeto_aprovado', titulo },
        })

        await prisma.baseConhecimento.create({
          data: {
            tipo: 'projeto_aprovado',
            titulo,
            dados: {
              projetoId: id,
              nome: projeto.nome,
              aiProvider: projeto.aiProvider,
              aprovadoEm: new Date().toISOString(),
              versao: orcamento.versao,
              resumo: orcDados.resumo ?? null,
              totalGeral: orcDados.totalGeral ?? null,
              custoM2: orcDados.custoM2 ?? null,
              areaTotal: orcDados.areaTotal ?? null,
              escopo: orcDados.escopo ?? [],
              itens: orcDados.itens ?? [],
              maoDeObra: orcDados.maoDeObra ?? [],
              cronograma: orcDados.cronograma ?? [],
              observacoes: orcDados.observacoes ?? '',
            } as unknown as Parameters<typeof prisma.baseConhecimento.create>[0]['data']['dados'],
          },
        })

        await prisma.projeto.update({
          where: { id },
          data: { status: 'APROVADO' },
        })
      }
    }

    return Response.json(orcamento)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao atualizar orçamento' }, { status: 500 })
  }
}

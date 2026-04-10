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

    if (existing) {
      const orcamento = await prisma.orcamento.update({
        where: { projetoId: id },
        data: {
          ...(dados && { dados: dados as unknown as Parameters<typeof prisma.orcamento.update>[0]['data']['dados'], versao: { increment: 1 } }),
          ...(aprovado !== undefined && { aprovado }),
        },
      })
      return Response.json(orcamento)
    } else {
      const orcamento = await prisma.orcamento.create({
        data: {
          projetoId: id,
          dados: dados as unknown as Parameters<typeof prisma.orcamento.create>[0]['data']['dados'],
          aprovado: aprovado ?? false,
        },
      })
      return Response.json(orcamento)
    }
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao atualizar orçamento' }, { status: 500 })
  }
}

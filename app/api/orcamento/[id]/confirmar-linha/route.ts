import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'
import type { LinhaBaseInfo } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { linha } = (await request.json()) as { linha: LinhaBaseInfo }

    if (!linha) {
      return Response.json({ error: 'linha é obrigatório' }, { status: 400 })
    }

    const projeto = await prisma.projeto.findUnique({ where: { id } })
    if (!projeto) {
      return Response.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    await prisma.baseConhecimento.create({
      data: {
        tipo: 'referencia_linha',
        titulo: `Referência: ${linha.descricao} — ${projeto.nome}`,
        dados: {
          projetoId: id,
          projetoNome: projeto.nome,
          descricao: linha.descricao,
          unidade: linha.unidade ?? null,
          custoUnit: linha.custoUnit ?? null,
          valorDia: linha.valorDia ?? null,
          total: linha.total,
          tipo: linha.tipo,
          confirmadoEm: new Date().toISOString(),
        } as unknown as Parameters<typeof prisma.baseConhecimento.create>[0]['data']['dados'],
      },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao salvar referência' }, { status: 500 })
  }
}

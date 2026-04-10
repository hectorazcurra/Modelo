import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET() {
  try {
    const projetos = await prisma.projeto.findMany({
      orderBy: { atualizadoEm: 'desc' },
      select: {
        id: true,
        nome: true,
        descricao: true,
        status: true,
        aiProvider: true,
        criadoEm: true,
        atualizadoEm: true,
        _count: { select: { mensagens: true } },
        orcamento: {
          select: {
            aprovado: true,
            dados: true,
          },
        },
      },
    })
    return Response.json(projetos)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao buscar projetos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, descricao, aiProvider } = body

    if (!nome?.trim()) {
      return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const projeto = await prisma.projeto.create({
      data: {
        nome: nome.trim(),
        descricao: descricao?.trim() || null,
        aiProvider: aiProvider || 'claude',
      },
    })

    return Response.json(projeto, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao criar projeto' }, { status: 500 })
  }
}

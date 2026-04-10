import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { conteudo } = body

    if (!conteudo?.trim()) {
      return Response.json({ error: 'Conteúdo é obrigatório' }, { status: 400 })
    }

    const mensagem = await prisma.mensagem.create({
      data: {
        projetoId: id,
        role: 'user',
        conteudo: conteudo.trim(),
      },
    })

    return Response.json(mensagem, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao salvar mensagem' }, { status: 500 })
  }
}

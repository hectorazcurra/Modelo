import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const projeto = await prisma.projeto.findUnique({
      where: { id },
      include: {
        mensagens: { orderBy: { criadoEm: 'asc' } },
        orcamento: true,
      },
    })

    if (!projeto) {
      return Response.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    return Response.json(projeto)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao buscar projeto' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nome, descricao, status, aiProvider } = body

    const projeto = await prisma.projeto.update({
      where: { id },
      data: {
        ...(nome && { nome: nome.trim() }),
        ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
        ...(status && { status }),
        ...(aiProvider && { aiProvider }),
      },
    })

    return Response.json(projeto)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao atualizar projeto' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.projeto.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao excluir projeto' }, { status: 500 })
  }
}

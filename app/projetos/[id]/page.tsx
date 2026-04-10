import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { WorkspaceClient } from './WorkspaceClient'
import type { OrcamentoDados } from '@/types'
import type { UIMessage } from 'ai'

export const dynamic = 'force-dynamic'

export default async function ProjetoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const projeto = await prisma.projeto.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { criadoEm: 'asc' } },
      orcamento: true,
    },
  })

  if (!projeto) notFound()

  // Convert DB messages to UIMessage format
  const initialMessages: UIMessage[] = projeto.mensagens.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: m.conteudo }],
  }))

  return (
    <WorkspaceClient
      projeto={{
        id: projeto.id,
        nome: projeto.nome,
        status: projeto.status,
        aiProvider: projeto.aiProvider,
        pdfNome: projeto.pdfNome,
        hasPdf: !!projeto.pdfTexto,
      }}
      initialMessages={initialMessages}
      initialOrcamento={
        projeto.orcamento
          ? {
              dados: projeto.orcamento.dados as unknown as OrcamentoDados,
              versao: projeto.orcamento.versao,
              aprovado: projeto.orcamento.aprovado,
            }
          : null
      }
    />
  )
}

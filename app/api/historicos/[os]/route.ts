import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ os: string }> },
) {
  const { os } = await params
  const osCode = decodeURIComponent(os)

  try {
    // JSON_EXTRACT in WHERE without ORDER BY does not trigger sort_buffer overflow.
    // MySQL does a sequential scan and stops at the first match (LIMIT 1).
    const rows = await prisma.$queryRaw<Array<{ dados: unknown }>>`
      SELECT dados
      FROM BaseConhecimento
      WHERE tipo = 'projeto_historico'
        AND JSON_EXTRACT(dados, '$.os') = ${osCode}
      LIMIT 1
    `

    if (!rows.length) {
      return Response.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    let dados = rows[0].dados
    if (typeof dados === 'string') {
      try { dados = JSON.parse(dados) } catch { /* return raw */ }
    }

    return Response.json(dados)
  } catch (error) {
    console.error('[historicos] lookup error:', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

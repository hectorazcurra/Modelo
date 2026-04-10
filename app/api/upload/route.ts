import { NextRequest } from 'next/server'
import { extractPDFText } from '@/lib/pdf/extractor'
import { prisma } from '@/lib/db/client'

export const config = {
  api: { bodyParser: false },
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const projetoId = formData.get('projetoId') as string | null

    if (!file) {
      return Response.json({ error: 'Arquivo PDF é obrigatório' }, { status: 400 })
    }

    if (!projetoId) {
      return Response.json({ error: 'projetoId é obrigatório' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return Response.json({ error: 'Arquivo deve ser PDF' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { text, numPages } = await extractPDFText(buffer)

    await prisma.projeto.update({
      where: { id: projetoId },
      data: {
        pdfNome: file.name,
        pdfTexto: text,
        status: 'ANALISE',
      },
    })

    return Response.json({
      success: true,
      numPages,
      preview: text.slice(0, 500),
      totalChars: text.length,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao processar PDF' }, { status: 500 })
  }
}

import * as path from 'node:path'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'
import { extractTextFromFile } from '@/lib/extractors/docs'

const ACCEPTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.msg', '.eml',
  '.xlsx', '.xls', '.xlsm', '.txt', '.zip',
])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const projetoId = formData.get('projetoId') as string | null

    if (!file) {
      return Response.json({ error: 'Arquivo é obrigatório' }, { status: 400 })
    }

    if (!projetoId) {
      return Response.json({ error: 'projetoId é obrigatório' }, { status: 400 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return Response.json(
        { error: `Formato não suportado: ${ext}. Use PDF, DOCX, MSG, EML, XLSX, TXT ou ZIP.` },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const text = await extractTextFromFile(file.name, buffer)

    if (!text || !text.trim()) {
      return Response.json(
        { error: 'Não foi possível extrair texto do arquivo. Verifique se o arquivo contém texto legível.' },
        { status: 422 },
      )
    }

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
      preview: text.slice(0, 500),
      totalChars: text.length,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}

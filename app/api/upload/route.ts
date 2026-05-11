import * as path from 'node:path'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/client'
import { extractTextFromFile } from '@/lib/extractors/docs'

const ACCEPTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.msg', '.eml',
  '.xlsx', '.xls', '.xlsm', '.pptx', '.ppt', '.txt', '.zip',
])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('file') as File[]
    const projetoId = formData.get('projetoId') as string | null

    if (!files.length) {
      return Response.json({ error: 'Pelo menos um arquivo é obrigatório' }, { status: 400 })
    }

    if (!projetoId) {
      return Response.json({ error: 'projetoId é obrigatório' }, { status: 400 })
    }

    const textParts: string[] = []
    const names: string[] = []
    const errors: string[] = []

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase()
      if (!ACCEPTED_EXTENSIONS.has(ext)) {
        errors.push(`${file.name}: formato não suportado (${ext})`)
        continue
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const text = await extractTextFromFile(file.name, buffer)

      if (!text || !text.trim()) {
        errors.push(`${file.name}: não foi possível extrair texto`)
        continue
      }

      names.push(file.name)
      textParts.push(`=== ${file.name} ===\n${text}`)
    }

    if (!textParts.length) {
      return Response.json(
        { error: errors.length ? errors.join('; ') : 'Nenhum texto extraído dos arquivos enviados.' },
        { status: 422 },
      )
    }

    const combinedText = textParts.join('\n\n')

    await prisma.projeto.update({
      where: { id: projetoId },
      data: {
        pdfNome: names.join(', '),
        pdfTexto: combinedText,
        status: 'ANALISE',
      },
    })

    return Response.json({
      success: true,
      arquivos: names,
      avisos: errors.length ? errors : undefined,
      totalChars: combinedText.length,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}

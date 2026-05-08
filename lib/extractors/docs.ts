import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'

const SUPPORTED_TEXT_EXT = new Set(['.pdf', '.docx', '.msg', '.txt', '.xlsx', '.xls', '.xlsm'])
const SKIP_EXT = new Set([
  '.dwg', '.dwl', '.dwl2', '.ifc', '.rvt',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
  '.bak', '.tmp',
])

export interface ExtractedFile {
  caminho: string
  tipo: string
  tamanhoBytes: number
  texto: string
  origemZip?: string
}

export interface DocRecExtraction {
  textoConcatenado: string
  arquivos: Array<{ caminho: string; tipo: string; tamanhoBytes: number; bytesExtraidos: number }>
  totalBytesTexto: number
  truncado: boolean
}

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const { default: pdfParse } = await import('pdf-parse')
    const data = await pdfParse(buf)
    return data.text || ''
  } catch (err) {
    return `[erro ao ler PDF: ${err instanceof Error ? err.message : String(err)}]`
  }
}

async function extractDocxText(buf: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: buf })
    return result.value || ''
  } catch (err) {
    return `[erro ao ler DOCX: ${err instanceof Error ? err.message : String(err)}]`
  }
}

async function extractMsgText(buf: Buffer): Promise<string> {
  try {
    const mod = await import('@kenjiuno/msgreader')
    const MsgReader = (mod as { default: new (b: ArrayBuffer) => unknown } & Record<string, unknown>).default
      ?? (mod as Record<string, unknown>).MsgReader
      ?? mod
    const arrBuf = new ArrayBuffer(buf.byteLength)
    new Uint8Array(arrBuf).set(buf)
    type MsgFileData = {
      subject?: string
      senderName?: string
      senderEmail?: string
      recipients?: Array<{ name?: string; email?: string }>
      body?: string
      bodyHtml?: string
    }
    const reader = new (MsgReader as new (b: ArrayBuffer) => { getFileData(): MsgFileData })(arrBuf)
    const data = reader.getFileData()
    const lines: string[] = []
    if (data.subject) lines.push(`Assunto: ${data.subject}`)
    if (data.senderName || data.senderEmail) {
      lines.push(`De: ${data.senderName ?? ''} <${data.senderEmail ?? ''}>`)
    }
    if (data.recipients?.length) {
      lines.push(`Para: ${data.recipients.map((r) => r.name || r.email).join(', ')}`)
    }
    if (data.body) lines.push('', data.body)
    else if (data.bodyHtml) lines.push('', stripHtml(data.bodyHtml))
    return lines.join('\n')
  } catch (err) {
    return `[erro ao ler MSG: ${err instanceof Error ? err.message : String(err)}]`
  }
}

function extractXlsxText(buf: Buffer): string {
  try {
    const wb = XLSX.read(buf, { type: 'buffer' })
    const parts: string[] = []
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
      if (csv.trim()) parts.push(`--- Aba: ${name} ---\n${csv}`)
    }
    return parts.join('\n\n')
  } catch (err) {
    return `[erro ao ler XLSX: ${err instanceof Error ? err.message : String(err)}]`
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

async function extractByExtension(ext: string, buf: Buffer): Promise<string | null> {
  switch (ext) {
    case '.pdf':
      return await extractPdfText(buf)
    case '.docx':
      return await extractDocxText(buf)
    case '.msg':
      return await extractMsgText(buf)
    case '.txt':
      return buf.toString('utf-8')
    case '.xlsx':
    case '.xlsm':
    case '.xls':
      return extractXlsxText(buf)
    default:
      return null
  }
}

async function extractFromZip(
  zipBuf: Buffer,
  zipName: string,
): Promise<Array<{ nome: string; texto: string; tamanho: number }>> {
  const out: Array<{ nome: string; texto: string; tamanho: number }> = []
  try {
    const zip = new AdmZip(zipBuf)
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const ext = path.extname(entry.entryName).toLowerCase()
      if (!SUPPORTED_TEXT_EXT.has(ext)) continue
      if (ext === '.zip') continue // skip nested zips
      const data = entry.getData()
      const txt = await extractByExtension(ext, data)
      if (txt && txt.trim()) {
        out.push({
          nome: `${zipName}::${entry.entryName}`,
          texto: txt,
          tamanho: data.length,
        })
      }
    }
  } catch (err) {
    out.push({
      nome: zipName,
      texto: `[erro ao abrir ZIP: ${err instanceof Error ? err.message : String(err)}]`,
      tamanho: zipBuf.length,
    })
  }
  return out
}

function walkDir(dir: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(cur, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.isFile()) out.push(full)
    }
  }
  return out
}

export async function extractDocRecFolder(
  docRecPath: string,
  maxBytes = 30_000,
): Promise<DocRecExtraction> {
  const result: DocRecExtraction = {
    textoConcatenado: '',
    arquivos: [],
    totalBytesTexto: 0,
    truncado: false,
  }

  if (!fs.existsSync(docRecPath)) return result

  const files = walkDir(docRecPath).sort()
  const chunks: string[] = []
  let totalBytes = 0

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (SKIP_EXT.has(ext)) continue

    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    const rel = path.relative(docRecPath, file)

    if (ext === '.zip') {
      try {
        const buf = fs.readFileSync(file)
        const inner = await extractFromZip(buf, rel)
        for (const it of inner) {
          if (!it.texto.trim()) continue
          const header = `\n\n=== ${it.nome} ===\n`
          const piece = header + it.texto
          chunks.push(piece)
          totalBytes += Buffer.byteLength(piece, 'utf-8')
          result.arquivos.push({
            caminho: it.nome,
            tipo: path.extname(it.nome).toLowerCase().replace('.', ''),
            tamanhoBytes: it.tamanho,
            bytesExtraidos: Buffer.byteLength(it.texto, 'utf-8'),
          })
          if (totalBytes >= maxBytes) break
        }
      } catch (err) {
        result.arquivos.push({
          caminho: rel,
          tipo: 'zip',
          tamanhoBytes: stat.size,
          bytesExtraidos: 0,
        })
        chunks.push(`\n\n=== ${rel} ===\n[erro ao abrir ZIP: ${err instanceof Error ? err.message : String(err)}]`)
      }
      if (totalBytes >= maxBytes) break
      continue
    }

    if (!SUPPORTED_TEXT_EXT.has(ext)) continue

    try {
      const buf = fs.readFileSync(file)
      const txt = await extractByExtension(ext, buf)
      if (txt && txt.trim()) {
        const header = `\n\n=== ${rel} ===\n`
        const piece = header + txt
        chunks.push(piece)
        totalBytes += Buffer.byteLength(piece, 'utf-8')
        result.arquivos.push({
          caminho: rel,
          tipo: ext.replace('.', ''),
          tamanhoBytes: stat.size,
          bytesExtraidos: Buffer.byteLength(txt, 'utf-8'),
        })
      }
    } catch (err) {
      chunks.push(`\n\n=== ${rel} ===\n[erro: ${err instanceof Error ? err.message : String(err)}]`)
    }

    if (totalBytes >= maxBytes) break
  }

  let combined = chunks.join('').trim()
  if (Buffer.byteLength(combined, 'utf-8') > maxBytes) {
    combined = combined.slice(0, maxBytes) + '\n[... texto truncado ...]'
    result.truncado = true
  }
  result.textoConcatenado = combined
  result.totalBytesTexto = Buffer.byteLength(combined, 'utf-8')
  return result
}

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import {
  readPricingWorkbook,
  extractDashboard,
  extractPPU,
  extractTarefas,
  extractWorkbookText,
  extractAreaM2,
  type DashboardData,
  type PPUData,
  type EquipeTarefa,
} from '../lib/excel/extractor'
import { extractDocRecFolder, type DocRecExtraction } from '../lib/extractors/docs'

// ─── Folder name candidates per section ──────────────────────────────────────

const DOC_REC_NAMES   = ['01. Doc. Rec', '01. Doc Rec', '01.Doc.Rec', '01. Documentos Recebidos', '01. Doc.Rec']
const ORCAMENTO_NAMES = ['02. Orçamento', '02. Orcamento', '02 Orçamento', '02.Orcamento']
const SUPRIM_NAMES    = ['03. Suprimentos', '03 Suprimentos', '03.Suprimentos']
const ENGENH_NAMES    = ['04. Engenharia', '04. Engenharia e Projetos', '04 Engenharia', '04.Engenharia']
const PROP_NAMES      = ['05. Propostas', '05 Propostas', '05.Propostas', '05. Proposta']

// ─── Types ───────────────────────────────────────────────────────────────────

interface IndexProjeto {
  os: string
  cliente: string
  projetoUnidade: string
  descricao: string
  tipologia: string
  produto: string
  valorOrcado: number | null
  margem: number | null
  resultado: number | null
  statusComercial: string
  nomePasta: string
}

interface FolderSection {
  text: string
  arquivos: number
  bytes: number
  truncado: boolean
}

interface ImportRecord {
  csv: IndexProjeto
  pasta: string | null
  arquivoXlsx: string | null
  revisao: string | null
  dashboard: DashboardData | null
  ppu: PPUData | null
  equipes: EquipeTarefa[] | null
  // Per-folder extractions
  docRec: FolderSection | null
  suprimentos: FolderSection | null
  engenharia: FolderSection | null
  propostas: FolderSection | null
  outrosOrcamento: FolderSection | null
  // Derived
  areaM2: number | null
  erro: string | null
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2)
  let index = '', dir = '/var/lib/metodo/arquivos/'
  let dryRun = false, limit: number | null = null, os: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--index' || a === '--csv') index = argv[++i]
    else if (a === '--dir') dir = argv[++i]
    else if (a === '--dry-run') dryRun = true
    else if (a === '--limit') limit = parseInt(argv[++i], 10)
    else if (a === '--os') os = argv[++i]
  }

  if (!index) {
    console.error(
      'Uso: tsx scripts/import-historico.ts --index <FUP.xlsx> [--dir <base>] [--dry-run] [--limit N] [--os <prefixo>]'
    )
    process.exit(1)
  }
  return { index, dir, dryRun, limit, os }
}

// ─── Number / string utils ────────────────────────────────────────────────────

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[R$\s%"]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// ─── Read index from XLSX ─────────────────────────────────────────────────────

function readIndexXlsx(filePath: string): IndexProjeto[] {
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true })

  const sheetName =
    wb.SheetNames.find((n) =>
      ['fup', 'projetos', 'dados', 'comercial', 'base'].some((k) => norm(n).includes(k))
    ) ?? wb.SheetNames[0]

  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`Aba não encontrada no arquivo: ${filePath}`)

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false, raw: true })

  let headerRowIdx = -1
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r].map((c) => norm(str(c)))
    const hasCliente = cells.some((c) => c.includes('cliente'))
    const hasId = ['numero', 'n°', 'n.', 'pasta', 'produto'].some((k) => cells.some((c) => c.includes(k)))
    if (hasCliente && hasId) { headerRowIdx = r; break }
  }

  if (headerRowIdx < 0) throw new Error('Cabeçalho não encontrado no arquivo índice')

  const header = rows[headerRowIdx].map((c) => norm(str(c)))
  console.log(`  Cabeçalho na linha ${headerRowIdx + 1}: ${header.filter(Boolean).slice(0, 8).join(' | ')}`)

  function col(...needles: string[]): number {
    for (let i = 0; i < header.length; i++) {
      if (needles.some((n) => header[i] === n || header[i].startsWith(n))) return i
    }
    for (let i = 0; i < header.length; i++) {
      if (needles.some((n) => header[i].includes(n))) return i
    }
    return -1
  }

  const colOS      = col('numero', 'n°', 'n.o', 'codigo', 'os')
  const colCliente = col('cliente')
  const colProjeto = col('projeto/unidade', 'projeto', 'unidade')
  const colDesc    = col('descricao', 'desc')
  const colTipo    = col('tipologia')
  const colProd    = col('produto')
  const colValor   = col('valor orcado', 'valor')
  const colMargem  = col('margem')
  const colResult  = col('resultado')
  const colStatus  = col('status comercial', 'status')
  const colPasta   = col('nome da pasta', 'pasta')

  const projetos: IndexProjeto[] = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const os = str(row[colOS])
    if (!os || os === '-') continue
    const cliente = str(row[colCliente])
    if (!cliente) continue
    projetos.push({
      os, cliente,
      projetoUnidade: colProjeto >= 0 ? str(row[colProjeto]) : '',
      descricao:      colDesc >= 0    ? str(row[colDesc]) : '',
      tipologia:      colTipo >= 0    ? str(row[colTipo]) : '',
      produto:        colProd >= 0    ? str(row[colProd]) : '',
      valorOrcado:    colValor >= 0   ? parseNum(row[colValor]) : null,
      margem:         colMargem >= 0  ? parseNum(row[colMargem]) : null,
      resultado:      colResult >= 0  ? parseNum(row[colResult]) : null,
      statusComercial: colStatus >= 0 ? str(row[colStatus]) : '',
      nomePasta:      colPasta >= 0   ? str(row[colPasta]) : '',
    })
  }
  return projetos
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

function findProjectFolder(baseDir: string, proj: IndexProjeto): string | null {
  if (proj.nomePasta) {
    const p = path.join(baseDir, proj.nomePasta)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }
  if (!fs.existsSync(baseDir)) return null
  for (const e of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    if (e.name === proj.os || e.name.startsWith(proj.os + ' ') ||
        e.name.startsWith(proj.os + '-') || e.name.startsWith(proj.os + '_')) {
      return path.join(baseDir, e.name)
    }
  }
  return null
}

function findSubfolder(projectFolder: string, candidates: string[]): string | null {
  for (const name of candidates) {
    const p = path.join(projectFolder, name)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }
  return null
}

// Find the latest non-obsolete Rev.N subfolder
function findLatestRevFolder(folder: string): string | null {
  try {
    const revs = fs.readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^Rev\.?\s*\d+/i.test(e.name) && !/obsoleto/i.test(e.name))
      .map((e) => {
        const m = e.name.match(/Rev\.?\s*(\d+)/i)
        return { name: e.name, num: m ? parseInt(m[1], 10) : -1 }
      })
      .filter((r) => r.num >= 0)
      .sort((a, b) => b.num - a.num)
    return revs.length > 0 ? path.join(folder, revs[0].name) : null
  } catch {
    return null
  }
}

function findLatestPricingXlsx(projectFolder: string): { xlsx: string; rev: string; revPath: string } | null {
  const orcPath = findSubfolder(projectFolder, ORCAMENTO_NAMES)
  if (!orcPath) return null

  const latestRev = findLatestRevFolder(orcPath)
  if (!latestRev) return null

  const revName = path.basename(latestRev)
  const files = fs.readdirSync(latestRev)
    .filter((f) => /^Pricing.*\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    .sort()
  if (!files.length) return null
  return { xlsx: path.join(latestRev, files[files.length - 1]), rev: revName, revPath: latestRev }
}

// ─── Folder text extraction wrapper ──────────────────────────────────────────

async function extractSection(
  folder: string | null,
  maxBytes: number,
  excludePatterns: RegExp[] = [],
): Promise<FolderSection | null> {
  if (!folder || !fs.existsSync(folder)) return null
  try {
    const result = await extractDocRecFolder(folder, maxBytes, excludePatterns)
    if (!result.textoConcatenado.trim() && result.arquivos.length === 0) return null
    return {
      text: result.textoConcatenado,
      arquivos: result.arquivos.length,
      bytes: result.totalBytesTexto,
      truncado: result.truncado,
    }
  } catch {
    return null
  }
}

// Read other XLSX files in Orçamento Rev folder (Composição Equipe, etc.)
async function extractOutrosOrcamento(revPath: string): Promise<FolderSection | null> {
  try {
    const files = fs.readdirSync(revPath)
      .filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$') && !/^Pricing/i.test(f))
    if (!files.length) return null

    const parts: string[] = []
    let totalBytes = 0
    const MAX = 20_000

    for (const f of files) {
      try {
        const buf = fs.readFileSync(path.join(revPath, f))
        const wb = XLSX.read(buf, { type: 'buffer' })
        const text = extractWorkbookText(wb)
        if (text.trim()) {
          const piece = `\n\n=== ${f} ===\n${text}`
          parts.push(piece)
          totalBytes += Buffer.byteLength(piece, 'utf-8')
          if (totalBytes >= MAX) break
        }
      } catch {
        // skip unreadable files
      }
    }

    if (!parts.length) return null
    const combined = parts.join('').trim()
    return {
      text: combined,
      arquivos: files.length,
      bytes: Buffer.byteLength(combined, 'utf-8'),
      truncado: totalBytes >= MAX,
    }
  } catch {
    return null
  }
}

// ─── Per-project processing ───────────────────────────────────────────────────

async function processProject(baseDir: string, proj: IndexProjeto): Promise<ImportRecord> {
  const rec: ImportRecord = {
    csv: proj, pasta: null, arquivoXlsx: null, revisao: null,
    dashboard: null, ppu: null, equipes: null,
    docRec: null, suprimentos: null, engenharia: null, propostas: null, outrosOrcamento: null,
    areaM2: null, erro: null,
  }

  try {
    const folder = findProjectFolder(baseDir, proj)
    if (!folder) { rec.erro = 'Pasta não encontrada'; return rec }
    rec.pasta = folder

    // ── 01. Doc. Rec (carta convite, visita técnica, questionamentos) ──
    rec.docRec = await extractSection(
      findSubfolder(folder, DOC_REC_NAMES),
      45_000,  // increased: richest context
    )

    // ── 03. Suprimentos (cotações, materiais, fornecedores) ──
    rec.suprimentos = await extractSection(
      findSubfolder(folder, SUPRIM_NAMES),
      25_000,
    )

    // ── 04. Engenharia (specs técnicas, cronogramas) ──
    rec.engenharia = await extractSection(
      findSubfolder(folder, ENGENH_NAMES),
      15_000,
    )

    // ── 05. Propostas — apenas a última revisão ──
    const propFolder = findSubfolder(folder, PROP_NAMES)
    if (propFolder) {
      const latestPropRev = findLatestRevFolder(propFolder) ?? propFolder
      rec.propostas = await extractSection(latestPropRev, 25_000)
    }

    // ── 02. Orçamento — Pricing XLSX (estruturado) ──
    const found = findLatestPricingXlsx(folder)
    if (!found) {
      rec.erro = 'Pricing_*.xlsx não encontrado em 02. Orçamento'
      // Don't return — other folders may still have valuable data
    } else {
      rec.arquivoXlsx = found.xlsx
      rec.revisao = found.rev
      try {
        const wb = readPricingWorkbook(found.xlsx)
        rec.dashboard = extractDashboard(wb)
        rec.ppu = extractPPU(wb)
        rec.equipes = extractTarefas(wb)
      } catch (err) {
        rec.erro = `Erro ao ler Pricing: ${err instanceof Error ? err.message : String(err)}`
      }

      // ── Outros XLSXs no folder de orçamento (Composição Equipe, etc.) ──
      rec.outrosOrcamento = await extractOutrosOrcamento(found.revPath)
    }

    // ── m² — busca em todos os textos extraídos ──
    const allText = [
      rec.docRec?.text, rec.propostas?.text, rec.outrosOrcamento?.text, rec.engenharia?.text,
    ].filter(Boolean).join(' ')

    rec.areaM2 = extractAreaM2(allText) ?? (rec.dashboard?.areaM2 ?? null)

  } catch (err) {
    rec.erro = err instanceof Error ? err.message : String(err)
  }

  return rec
}

// ─── Build DB record ──────────────────────────────────────────────────────────

function buildTitulo(proj: IndexProjeto): string {
  return [`OS ${proj.os}`, proj.cliente, proj.descricao].filter(Boolean).join(' - ').slice(0, 250)
}

function sectionToDados(s: FolderSection | null) {
  if (!s) return null
  return { textoExtraido: s.text, arquivos: s.arquivos, totalBytes: s.bytes, truncado: s.truncado }
}

function buildDados(rec: ImportRecord) {
  const { csv: p, dashboard, ppu, equipes, arquivoXlsx, revisao, pasta } = rec
  return {
    // Index fields
    os: p.os, cliente: p.cliente, projetoUnidade: p.projetoUnidade,
    descricao: p.descricao, tipologia: p.tipologia, produto: p.produto,
    valorOrcado: p.valorOrcado, margem: p.margem, resultado: p.resultado,
    statusComercial: p.statusComercial, nomePasta: p.nomePasta,

    // Resolved paths
    pastaResolvida: pasta,
    arquivoXlsx: arquivoXlsx ? path.basename(arquivoXlsx) : null,
    revisao,

    // Pricing XLSX — structured data
    dashboard: dashboard ?? null,
    itens: ppu?.itens ?? null,
    categorias: ppu?.categorias ?? null,
    totalGeralPPU: ppu?.totalGeral ?? null,
    mobilizacao: ppu?.mobilizacao ?? null,
    despesasOperacionais: ppu?.despesasOperacionais ?? null,
    maoDeObraCategoria: ppu?.maoDeObra ?? null,
    equipes: equipes ?? null,

    // Per-folder extracted text
    cartaConvite:    sectionToDados(rec.docRec),
    suprimentos:     sectionToDados(rec.suprimentos),
    engenharia:      sectionToDados(rec.engenharia),
    propostas:       sectionToDados(rec.propostas),
    outrosOrcamento: sectionToDados(rec.outrosOrcamento),

    // Derived
    areaM2: rec.areaM2,

    importadoEm: new Date().toISOString(),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  console.log(`Índice: ${args.index}`)
  console.log(`Diretório base: ${args.dir}`)
  console.log(`Modo: ${args.dryRun ? 'DRY-RUN' : 'GRAVAÇÃO'}`)
  if (args.limit) console.log(`Limite: ${args.limit} projetos`)
  console.log()

  let projetos: IndexProjeto[]
  try {
    projetos = readIndexXlsx(args.index)
  } catch (err) {
    console.error('Erro ao ler arquivo índice:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  console.log(`${projetos.length} projetos lidos do índice.\n`)

  let filtrados = projetos
  if (args.os) {
    filtrados = projetos.filter((p) => p.os.startsWith(args.os!))
    console.log(`Filtrando por OS "${args.os}": ${filtrados.length} projetos.\n`)
  }
  const lista = args.limit ? filtrados.slice(0, args.limit) : filtrados

  const records: ImportRecord[] = []
  for (const proj of lista) {
    const rec = await processProject(args.dir, proj)
    records.push(rec)

    const kb = (s: FolderSection | null) => s ? `${s.arquivos}/${(s.bytes / 1024).toFixed(0)}KB` : '-'
    const label = `${proj.os} ${proj.cliente}`.slice(0, 38).padEnd(38)
    const info = rec.pasta
      ? [
          `doc=${kb(rec.docRec)}`,
          `supr=${kb(rec.suprimentos)}`,
          `prop=${kb(rec.propostas)}`,
          `ppu=${rec.ppu?.itens.length ?? 0}`,
          `eq=${rec.equipes?.length ?? 0}`,
          rec.areaM2 ? `m²=${rec.areaM2}` : '',
        ].filter(Boolean).join('  ')
      : `ERRO: ${rec.erro}`

    console.log(`  ${label} → ${info}`)
  }

  const ok    = records.filter((r) => r.pasta)
  const erros = records.filter((r) => !r.pasta)
  console.log(`\nResumo: ${ok.length} com pasta encontrada, ${erros.length} sem pasta.`)

  if (args.dryRun) {
    console.log('\n[DRY-RUN] Nada foi gravado.')
    const first = ok[0]
    if (first) {
      console.log('\nExemplo do primeiro registro:')
      console.log(JSON.stringify(buildDados(first), null, 2).slice(0, 3000))
    }
    return
  }

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string)
  const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

  try {
    let inseridos = 0
    for (const rec of records) {
      const titulo = buildTitulo(rec.csv)
      const dados = buildDados(rec)
      await prisma.baseConhecimento.deleteMany({
        where: { tipo: 'projeto_historico', titulo: { startsWith: `OS ${rec.csv.os}` } },
      })
      await prisma.baseConhecimento.create({
        data: {
          tipo: 'projeto_historico',
          titulo,
          dados: dados as unknown as Parameters<typeof prisma.baseConhecimento.create>[0]['data']['dados'],
        },
      })
      inseridos++
    }
    console.log(`\n${inseridos} registros gravados em BaseConhecimento.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})

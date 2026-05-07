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
  type DashboardData,
  type PPUData,
  type EquipeTarefa,
} from '../lib/excel/extractor'

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

interface ImportRecord {
  csv: IndexProjeto
  pasta: string | null
  arquivoXlsx: string | null
  revisao: string | null
  dashboard: DashboardData | null
  ppu: PPUData | null
  equipes: EquipeTarefa[] | null
  erro: string | null
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(): { index: string; dir: string; dryRun: boolean; limit: number | null } {
  const argv = process.argv.slice(2)
  let index = ''
  let dir = '/var/lib/metodo/arquivos/'
  let dryRun = false
  let limit: number | null = null

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--index' || a === '--csv') index = argv[++i]
    else if (a === '--dir') dir = argv[++i]
    else if (a === '--dry-run') dryRun = true
    else if (a === '--limit') limit = parseInt(argv[++i], 10)
  }

  if (!index) {
    console.error(
      'Uso: tsx scripts/import-historico.ts --index <FUP.xlsx> [--dir <base>] [--dry-run] [--limit N]'
    )
    process.exit(1)
  }
  return { index, dir, dryRun, limit }
}

// ─── Number parsing ──────────────────────────────────────────────────────────

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v)
    .replace(/[R$\s%"]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

// ─── Normalize text for column matching ──────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ─── Read index from XLSX ────────────────────────────────────────────────────

function readIndexXlsx(filePath: string): IndexProjeto[] {
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true })

  // Try to find the right sheet: prefer one named FUP, Projetos, Dados, or use first
  const sheetName =
    wb.SheetNames.find((n) =>
      ['fup', 'projetos', 'dados', 'comercial', 'base'].some((k) => norm(n).includes(k))
    ) ?? wb.SheetNames[0]

  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`Aba não encontrada no arquivo: ${filePath}`)

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  })

  // Find the header row: the first row that has "cliente" AND ("número" OR "pasta") in any cell
  let headerRowIdx = -1
  const REQUIRED = ['cliente']
  const ANY_OF = ['numero', 'n°', 'n.', 'pasta', 'produto']

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r].map((c) => norm(str(c)))
    const hasRequired = REQUIRED.every((req) => cells.some((c) => c.includes(req)))
    const hasAny = ANY_OF.some((key) => cells.some((c) => c.includes(key)))
    if (hasRequired && hasAny) {
      headerRowIdx = r
      break
    }
  }

  if (headerRowIdx < 0) {
    throw new Error(
      `Não foi possível encontrar o cabeçalho no arquivo ${path.basename(filePath)}.\n` +
        `Primeiros 5 valores da linha 1: ${rows[0]?.slice(0, 5).join(' | ')}`
    )
  }

  const header = rows[headerRowIdx].map((c) => norm(str(c)))
  console.log(`  Cabeçalho encontrado na linha ${headerRowIdx + 1}: ${header.filter(Boolean).slice(0, 8).join(' | ')}`)

  // Map columns by normalized name patterns
  function col(...needles: string[]): number {
    for (let i = 0; i < header.length; i++) {
      if (needles.some((n) => header[i] === n || header[i].startsWith(n))) return i
    }
    // fallback: partial match
    for (let i = 0; i < header.length; i++) {
      if (needles.some((n) => header[i].includes(n))) return i
    }
    return -1
  }

  const colOS = col('numero', 'n°', 'n.o', 'codigo', 'os')
  const colCliente = col('cliente')
  const colProjeto = col('projeto/unidade', 'projeto', 'unidade')
  const colDescricao = col('descricao', 'desc')
  const colTipologia = col('tipologia')
  const colProduto = col('produto')
  const colValor = col('valor orcado', 'valor')
  const colMargem = col('margem')
  const colResultado = col('resultado')
  const colStatus = col('status comercial', 'status')
  const colPasta = col('nome da pasta', 'pasta')

  console.log(
    `  Colunas: OS=${colOS} Cliente=${colCliente} Produto=${colProduto} Pasta=${colPasta} Status=${colStatus}`
  )

  if (colOS < 0 || colCliente < 0) {
    throw new Error(
      `Colunas obrigatórias não encontradas. Cabeçalho detectado:\n${header.join(' | ')}`
    )
  }

  const projetos: IndexProjeto[] = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const os = str(row[colOS])
    if (!os || os === '-') continue
    // Skip rows that look like sub-totals or category headers (no numeric OS)
    const cliente = str(row[colCliente])
    if (!cliente) continue

    projetos.push({
      os,
      cliente,
      projetoUnidade: colProjeto >= 0 ? str(row[colProjeto]) : '',
      descricao: colDescricao >= 0 ? str(row[colDescricao]) : '',
      tipologia: colTipologia >= 0 ? str(row[colTipologia]) : '',
      produto: colProduto >= 0 ? str(row[colProduto]) : '',
      valorOrcado: colValor >= 0 ? parseNum(row[colValor]) : null,
      margem: colMargem >= 0 ? parseNum(row[colMargem]) : null,
      resultado: colResultado >= 0 ? parseNum(row[colResultado]) : null,
      statusComercial: colStatus >= 0 ? str(row[colStatus]) : '',
      nomePasta: colPasta >= 0 ? str(row[colPasta]) : '',
    })
  }

  return projetos
}

// ─── Project folder resolution ───────────────────────────────────────────────

function findProjectFolder(baseDir: string, proj: IndexProjeto): string | null {
  // 1. Try nomePasta exact match
  if (proj.nomePasta) {
    const p = path.join(baseDir, proj.nomePasta)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }

  if (!fs.existsSync(baseDir)) return null

  // 2. Scan directory for folder starting with the OS number
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (
      e.name === proj.os ||
      e.name.startsWith(proj.os + ' ') ||
      e.name.startsWith(proj.os + '-') ||
      e.name.startsWith(proj.os + '_')
    ) {
      return path.join(baseDir, e.name)
    }
  }
  return null
}

function findLatestPricingXlsx(projectFolder: string): { xlsx: string; rev: string } | null {
  const orcamentoDirs = ['02. Orçamento', '02 Orçamento', '02. Orcamento', '02.Orcamento']
  let orcamentoPath: string | null = null
  for (const o of orcamentoDirs) {
    const candidate = path.join(projectFolder, o)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      orcamentoPath = candidate
      break
    }
  }
  if (!orcamentoPath) return null

  const revs = fs
    .readdirSync(orcamentoPath, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^Rev\.?\s*\d+/i.test(e.name) && !/obsoleto/i.test(e.name))
    .map((e) => {
      const m = e.name.match(/Rev\.?\s*(\d+)/i)
      return { name: e.name, num: m ? parseInt(m[1], 10) : -1 }
    })
    .filter((r) => r.num >= 0)
    .sort((a, b) => b.num - a.num)

  for (const rev of revs) {
    const revPath = path.join(orcamentoPath, rev.name)
    const files = fs
      .readdirSync(revPath)
      .filter((f) => /^Pricing.*\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    if (files.length > 0) {
      files.sort()
      return { xlsx: path.join(revPath, files[files.length - 1]), rev: rev.name }
    }
  }
  return null
}

// ─── Per-project processing ──────────────────────────────────────────────────

function processProject(baseDir: string, proj: IndexProjeto): ImportRecord {
  const rec: ImportRecord = {
    csv: proj,
    pasta: null,
    arquivoXlsx: null,
    revisao: null,
    dashboard: null,
    ppu: null,
    equipes: null,
    erro: null,
  }

  try {
    const folder = findProjectFolder(baseDir, proj)
    if (!folder) {
      rec.erro = 'Pasta não encontrada'
      return rec
    }
    rec.pasta = folder

    const found = findLatestPricingXlsx(folder)
    if (!found) {
      rec.erro = 'Pricing_*.xlsx não encontrado em 02. Orçamento'
      return rec
    }
    rec.arquivoXlsx = found.xlsx
    rec.revisao = found.rev

    const wb = readPricingWorkbook(found.xlsx)
    rec.dashboard = extractDashboard(wb)
    rec.ppu = extractPPU(wb)
    rec.equipes = extractTarefas(wb)
  } catch (err) {
    rec.erro = err instanceof Error ? err.message : String(err)
  }

  return rec
}

// ─── Build DB record ─────────────────────────────────────────────────────────

function buildTitulo(proj: IndexProjeto): string {
  const parts = [`OS ${proj.os}`]
  if (proj.cliente) parts.push(proj.cliente)
  if (proj.descricao) parts.push(proj.descricao)
  return parts.join(' - ').slice(0, 250)
}

function buildDados(rec: ImportRecord) {
  const { csv: proj, dashboard, ppu, equipes, arquivoXlsx, revisao, pasta } = rec
  return {
    os: proj.os,
    cliente: proj.cliente,
    projetoUnidade: proj.projetoUnidade,
    descricao: proj.descricao,
    tipologia: proj.tipologia,
    produto: proj.produto,
    valorOrcado: proj.valorOrcado,
    margem: proj.margem,
    resultado: proj.resultado,
    statusComercial: proj.statusComercial,
    nomePasta: proj.nomePasta,
    pastaResolvida: pasta,
    arquivoXlsx: arquivoXlsx ? path.basename(arquivoXlsx) : null,
    revisao,
    dashboard,
    itens: ppu?.itens ?? null,
    totalGeralPPU: ppu?.totalGeral ?? null,
    equipes: equipes ?? null,
    importadoEm: new Date().toISOString(),
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

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

  console.log(`\n${projetos.length} projetos lidos do índice.\n`)

  const lista = args.limit ? projetos.slice(0, args.limit) : projetos
  const records: ImportRecord[] = []

  for (const proj of lista) {
    const rec = processProject(args.dir, proj)
    records.push(rec)
    const status = rec.erro
      ? `ERRO: ${rec.erro}`
      : `OK  rev=${rec.revisao}  equipes=${rec.equipes?.length ?? 0}  ppu=${rec.ppu?.itens.length ?? 0}`
    const label = `${proj.os} ${proj.cliente}`.slice(0, 40).padEnd(40)
    console.log(`  ${label} → ${status}`)
  }

  const ok = records.filter((r) => !r.erro)
  const erros = records.filter((r) => r.erro)
  console.log(`\nResumo: ${ok.length} OK, ${erros.length} com erro.`)

  if (args.dryRun) {
    console.log('\n[DRY-RUN] Nada foi gravado.')
    if (ok[0]) {
      console.log('\nExemplo do primeiro registro OK:')
      console.log(JSON.stringify(buildDados(ok[0]), null, 2).slice(0, 2000))
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

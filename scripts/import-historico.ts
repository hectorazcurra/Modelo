import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
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

interface CSVProjeto {
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
  csv: CSVProjeto
  pasta: string | null
  arquivoXlsx: string | null
  revisao: string | null
  dashboard: DashboardData | null
  ppu: PPUData | null
  equipes: EquipeTarefa[] | null
  erro: string | null
}

function parseArgs(): { csv: string; dir: string; dryRun: boolean; limit: number | null } {
  const argv = process.argv.slice(2)
  let csv = ''
  let dir = '/var/www/lab/metodo/arquivos_teste/'
  let dryRun = false
  let limit: number | null = null

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--csv') csv = argv[++i]
    else if (a === '--dir') dir = argv[++i]
    else if (a === '--dry-run') dryRun = true
    else if (a === '--limit') limit = parseInt(argv[++i], 10)
  }

  if (!csv) {
    console.error('Uso: tsx scripts/import-historico.ts --csv <indice.csv> [--dir <base>] [--dry-run] [--limit N]')
    process.exit(1)
  }
  return { csv, dir, dryRun, limit }
}

function parseMoedaCSV(s: string): number | null {
  if (!s || s.trim() === '' || s.trim() === '-') return null
  const cleaned = s.replace(/[R$\s"]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parsePercentCSV(s: string): number | null {
  if (!s || s.trim() === '' || s.trim() === '-') return null
  const cleaned = s.replace(/[%\s]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) || []).length
  const semis = (line.match(/;/g) || []).length
  const commas = (line.match(/,/g) || []).length
  if (tabs >= semis && tabs >= commas) return '\t'
  if (semis >= commas) return ';'
  return ','
}

function parseCSVLine(line: string, delim: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === delim) {
        fields.push(cur)
        cur = ''
      } else cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function parseCSV(filePath: string): CSVProjeto[] {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '')
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []

  const delim = detectDelimiter(lines[0])
  const header = parseCSVLine(lines[0], delim).map((h) => h.trim().toLowerCase())

  const findCol = (...needles: string[]): number => {
    for (let i = 0; i < header.length; i++) {
      const h = header[i]
      if (needles.some((n) => h.includes(n))) return i
    }
    return -1
  }

  const colOS = findCol('número', 'numero', 'os', 'n°', 'codigo')
  const colCliente = findCol('cliente')
  const colProjetoUnidade = findCol('projeto/unidade', 'unidade')
  const colDescricao = findCol('descrição', 'descricao')
  const colTipologia = findCol('tipologia')
  const colProduto = findCol('produto')
  const colValor = findCol('valor orçado', 'valor orcado', 'valor')
  const colMargem = findCol('margem')
  const colResultado = findCol('resultado')
  const colStatus = findCol('status comercial', 'status')
  const colPasta = findCol('nome da pasta', 'pasta')

  const projetos: CSVProjeto[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i], delim)
    const os = (fields[colOS] ?? '').trim()
    if (!os) continue

    projetos.push({
      os,
      cliente: (fields[colCliente] ?? '').trim(),
      projetoUnidade: (fields[colProjetoUnidade] ?? '').trim(),
      descricao: (fields[colDescricao] ?? '').trim(),
      tipologia: (fields[colTipologia] ?? '').trim(),
      produto: (fields[colProduto] ?? '').trim(),
      valorOrcado: parseMoedaCSV(fields[colValor] ?? ''),
      margem: parsePercentCSV(fields[colMargem] ?? ''),
      resultado: parseMoedaCSV(fields[colResultado] ?? ''),
      statusComercial: (fields[colStatus] ?? '').trim(),
      nomePasta: (fields[colPasta] ?? '').trim(),
    })
  }
  return projetos
}

function findProjectFolder(baseDir: string, csv: CSVProjeto): string | null {
  const candidates: string[] = []
  if (csv.nomePasta) candidates.push(csv.nomePasta)

  for (const c of candidates) {
    const p = path.join(baseDir, c)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }

  if (!fs.existsSync(baseDir)) return null
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith(csv.os + ' ') || e.name.startsWith(csv.os + '-') || e.name === csv.os) {
      return path.join(baseDir, e.name)
    }
  }
  return null
}

function findLatestPricingXlsx(projectFolder: string): { xlsx: string; rev: string } | null {
  const orcamentoDirs = ['02. Orçamento', '02 Orçamento', '02. Orcamento']
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
    .filter((e) => e.isDirectory() && /^Rev\.?\s?\d+/i.test(e.name) && !/obsoleto/i.test(e.name))
    .map((e) => {
      const m = e.name.match(/Rev\.?\s?(\d+)/i)
      return { name: e.name, num: m ? parseInt(m[1], 10) : -1 }
    })
    .filter((r) => r.num >= 0)
    .sort((a, b) => b.num - a.num)

  for (const rev of revs) {
    const revPath = path.join(orcamentoPath, rev.name)
    const files = fs.readdirSync(revPath).filter((f) => /^Pricing.*\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    if (files.length > 0) {
      files.sort()
      return { xlsx: path.join(revPath, files[files.length - 1]), rev: rev.name }
    }
  }
  return null
}

function processProject(baseDir: string, csv: CSVProjeto): ImportRecord {
  const rec: ImportRecord = {
    csv,
    pasta: null,
    arquivoXlsx: null,
    revisao: null,
    dashboard: null,
    ppu: null,
    equipes: null,
    erro: null,
  }

  try {
    const folder = findProjectFolder(baseDir, csv)
    if (!folder) {
      rec.erro = 'Pasta do projeto não encontrada'
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

function buildTitulo(csv: CSVProjeto): string {
  const parts = [`OS ${csv.os}`]
  if (csv.cliente) parts.push(csv.cliente)
  if (csv.descricao) parts.push(csv.descricao)
  return parts.join(' - ').slice(0, 250)
}

function buildDados(rec: ImportRecord) {
  const { csv, dashboard, ppu, equipes, arquivoXlsx, revisao, pasta } = rec
  return {
    os: csv.os,
    cliente: csv.cliente,
    projetoUnidade: csv.projetoUnidade,
    descricao: csv.descricao,
    tipologia: csv.tipologia,
    produto: csv.produto,
    valorOrcadoCSV: csv.valorOrcado,
    margemCSV: csv.margem,
    resultadoCSV: csv.resultado,
    statusComercial: csv.statusComercial,
    nomePasta: csv.nomePasta,
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

async function main() {
  const args = parseArgs()
  console.log(`CSV: ${args.csv}`)
  console.log(`Diretório base: ${args.dir}`)
  console.log(`Modo: ${args.dryRun ? 'DRY-RUN' : 'GRAVAÇÃO'}`)
  if (args.limit) console.log(`Limite: ${args.limit} projetos`)

  const projetos = parseCSV(args.csv)
  console.log(`\n${projetos.length} projetos lidos do CSV.\n`)

  const lista = args.limit ? projetos.slice(0, args.limit) : projetos
  const records: ImportRecord[] = []

  for (const csv of lista) {
    const rec = processProject(args.dir, csv)
    records.push(rec)
    const status = rec.erro ? `ERRO: ${rec.erro}` : `OK (rev ${rec.revisao}, ${rec.equipes?.length ?? 0} equipes, ${rec.ppu?.itens.length ?? 0} itens PPU)`
    console.log(`  ${csv.os} ${csv.cliente.padEnd(20).slice(0, 20)} → ${status}`)
  }

  const ok = records.filter((r) => !r.erro)
  const erros = records.filter((r) => r.erro)
  console.log(`\nResumo: ${ok.length} OK, ${erros.length} com erro.`)

  if (args.dryRun) {
    console.log('\n[DRY-RUN] Nada foi gravado. Exemplo do primeiro registro:')
    if (ok[0]) console.log(JSON.stringify(buildDados(ok[0]), null, 2).slice(0, 2000))
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
        where: {
          tipo: 'projeto_historico',
          titulo: { startsWith: `OS ${rec.csv.os}` },
        },
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

/**
 * Batch diagnostic — scans ALL Pricing*.xlsx across the archive and reports
 * format variations, so we know which fields have different column names,
 * which sheets exist, and whether there is double-counting in Tarefas.
 *
 * Usage:
 *   npx tsx scripts/diagnose-batch.ts [--dir <base>] [--limit N]
 *
 * Default dir: /var/lib/metodo/arquivos/
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'
import { readPricingWorkbook, extractDashboard, extractTarefas } from '../lib/excel/extractor'

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
let baseDir = '/var/lib/metodo/arquivos/'
let limit: number | null = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dir')   baseDir = argv[++i]
  if (argv[i] === '--limit') limit   = parseInt(argv[++i], 10)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findLatestPricing(projectFolder: string): string | null {
  const orcPath = findSubfolder(projectFolder, ['02. Orçamento', '02. Orcamento', '02 Orçamento'])
  if (!orcPath) return null
  const revs = fs.readdirSync(orcPath, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^Rev\.?\s*\d+/i.test(e.name) && !/obsoleto/i.test(e.name))
    .map(e => ({ name: e.name, num: parseInt(e.name.match(/Rev\.?\s*(\d+)/i)?.[1] ?? '0') }))
    .sort((a, b) => b.num - a.num)
  for (const rev of revs) {
    const revPath = path.join(orcPath, rev.name)
    const files = fs.readdirSync(revPath)
      .filter(f => /^Pricing.*\.xlsx?$/i.test(f) && !f.startsWith('~$'))
      .sort()
    if (files.length) return path.join(revPath, files[files.length - 1])
  }
  return null
}

function findSubfolder(base: string, candidates: string[]): string | null {
  for (const c of candidates) {
    const p = path.join(base, c)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }
  return null
}

function getHiddenRows(sheet: XLSX.WorkSheet): number {
  const meta = (sheet['!rows'] ?? []) as Array<{ hidden?: boolean } | undefined>
  return meta.filter(r => r?.hidden).length
}

function sheetRowCount(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  return range.e.r - range.s.r + 1
}

// Get raw rows from a sheet (all cells, including sparse)
function allRows(sheet: XLSX.WorkSheet): Array<Array<unknown>> {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, defval: null, blankrows: false, raw: true,
  })
}

// Detect Tarefas block structure: counts distinct "sections" separated by
// rows with no string description (total/separator rows).
function analyzeTarefas(sheet: XLSX.WorkSheet): {
  headerLabels: string[]
  sectionCount: number
  hhTotalExtracted: number
  hhBloco1: number
  hhBloco2: number
  colMapping: Record<string, number>
} {
  const rows = allRows(sheet)

  // Find header row
  let headerIdx = -1
  const colMapping: Record<string, number> = {}
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] ?? '').trim() === 'Descrição da Equipe') {
        headerIdx = r
        for (let j = 0; j < row.length; j++) {
          const lbl = String(row[j] ?? '').trim()
          if (lbl) colMapping[lbl] = j
        }
        break
      }
    }
    if (headerIdx >= 0) break
  }

  const headerLabels = Object.keys(colMapping)

  if (headerIdx < 0) {
    return { headerLabels: [], sectionCount: 0, hhTotalExtracted: 0, hhBloco1: 0, hhBloco2: 0, colMapping }
  }

  const colHH   = colMapping['HH Total por equipe'] ?? -1
  const colDesc = colMapping['Descrição da Equipe'] ?? -1

  // Walk data rows and identify blocks
  // A block ends when we see a row that looks like a "total" row:
  // no string description but numeric HH value
  let bloco = 1
  let hhBloco1 = 0
  let hhBloco2 = 0
  let inBloco1 = true

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const desc = colDesc >= 0 ? row[colDesc] : null
    const hh   = colHH   >= 0 ? row[colHH]   : null
    const hhNum = typeof hh === 'number' ? hh : parseFloat(String(hh ?? '').replace(',', '.') || '0')

    const hasStringDesc = typeof desc === 'string' && desc.trim() !== ''
    const hasNumericHH  = Number.isFinite(hhNum) && hhNum > 0

    if (!hasStringDesc && hasNumericHH && bloco === 1) {
      // Looks like a total row — end of Bloco 1
      bloco = 2
      inBloco1 = false
      continue
    }

    if (!hasStringDesc) continue

    if (inBloco1 && hasNumericHH) hhBloco1 += hhNum
    else if (!inBloco1 && hasNumericHH) hhBloco2 += hhNum
  }

  const sectionCount = bloco

  return {
    headerLabels,
    sectionCount,
    hhTotalExtracted: hhBloco1 + hhBloco2,
    hhBloco1: Math.round(hhBloco1 * 100) / 100,
    hhBloco2: Math.round(hhBloco2 * 100) / 100,
    colMapping,
  }
}

// ─── Report types ─────────────────────────────────────────────────────────────

interface FileReport {
  os: string
  file: string
  rev: string
  sheets: string[]
  sheetIssues: string[]
  dashMissing: string[]
  hhDashboard: number | null
  hhBloco1: number
  hhBloco2: number
  hhEquipesExtracted: number
  tarefasHeaders: string[]
  ppuItems: number
  ppuEmpty: boolean
  error: string | null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const projectDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, fullPath: path.join(baseDir, e.name) }))

  const lista = limit ? projectDirs.slice(0, limit) : projectDirs
  console.log(`Varrendo ${lista.length} pastas em ${baseDir}\n`)

  const reports: FileReport[] = []
  const allTarefasHeaders = new Map<string, number>() // label → count
  const allDashLabels = new Set<string>()
  const allSheetNames = new Map<string, number>()

  for (const { name, fullPath } of lista) {
    const xlsxPath = findLatestPricing(fullPath)
    if (!xlsxPath) continue // no Pricing found

    const osMatch = name.match(/^(\d{4}-\d{3})/)
    const os = osMatch ? osMatch[1] : name.slice(0, 12)

    const report: FileReport = {
      os,
      file: path.basename(xlsxPath),
      rev: path.basename(path.dirname(xlsxPath)),
      sheets: [],
      sheetIssues: [],
      dashMissing: [],
      hhDashboard: null,
      hhBloco1: 0,
      hhBloco2: 0,
      hhEquipesExtracted: 0,
      tarefasHeaders: [],
      ppuItems: 0,
      ppuEmpty: false,
      error: null,
    }

    try {
      const wb = readPricingWorkbook(xlsxPath)
      report.sheets = wb.SheetNames

      for (const sn of wb.SheetNames) {
        allSheetNames.set(sn, (allSheetNames.get(sn) ?? 0) + 1)
        const sheet = wb.Sheets[sn]
        const hidden = getHiddenRows(sheet)
        if (hidden > 0) report.sheetIssues.push(`${sn}:${hidden}ocultas`)
      }

      // Dashboard
      const dash = extractDashboard(wb)
      report.hhDashboard = dash.hhMOD
      const dashChecks: [string, unknown][] = [
        ['Preço de Venda', dash.precoVenda],
        ['Margem %',       dash.margemPerc],
        ['Margem Valor',   dash.margemValor],
        ['Área m²',        dash.areaM2],
        ['Custo Total',    dash.custoTotal],
        ['Município',      dash.municipio],
      ]
      for (const [label, val] of dashChecks) {
        if (val == null) report.dashMissing.push(label)
      }

      // Tarefas
      if (wb.Sheets['Tarefas']) {
        const analysis = analyzeTarefas(wb.Sheets['Tarefas'])
        report.hhBloco1 = analysis.hhBloco1
        report.hhBloco2 = analysis.hhBloco2
        report.tarefasHeaders = analysis.headerLabels
        for (const lbl of analysis.headerLabels) {
          allTarefasHeaders.set(lbl, (allTarefasHeaders.get(lbl) ?? 0) + 1)
        }
        const equipes = extractTarefas(wb)
        report.hhEquipesExtracted = Math.round(equipes.reduce((s, e) => s + e.totalHH, 0) * 100) / 100
      }

      // PPU
      if (wb.Sheets['PPU']) {
        const ppuRows = allRows(wb.Sheets['PPU'])
        let nonZeroPrice = 0
        for (const row of ppuRows) {
          const last = row[row.length - 1]
          const v = typeof last === 'number' ? last : parseFloat(String(last ?? ''))
          if (v > 0) nonZeroPrice++
        }
        report.ppuItems = nonZeroPrice
        report.ppuEmpty = nonZeroPrice === 0
      }

    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err)
    }

    reports.push(report)
  }

  // ── Summary table ──────────────────────────────────────────────────────────

  console.log('═'.repeat(120))
  console.log('POR PROJETO')
  console.log('═'.repeat(120))
  console.log(
    'OS'.padEnd(12) +
    'Rev'.padEnd(8) +
    'HH_dash'.padStart(10) +
    'HH_b1'.padStart(10) +
    'HH_b2'.padStart(10) +
    'HH_ext'.padStart(10) +
    'PPU'.padStart(6) +
    '  Issues'
  )
  console.log('─'.repeat(120))

  for (const r of reports) {
    if (r.error) {
      console.log(`${r.os.padEnd(12)}${''.padEnd(8)}${''.padStart(10)}${''.padStart(10)}${''.padStart(10)}${''.padStart(10)}${''.padStart(6)}  ❌ ${r.error.slice(0, 60)}`)
      continue
    }

    const hhD = r.hhDashboard != null ? Math.round(r.hhDashboard).toString() : '?'
    const doubleCount = r.hhBloco2 > 100 ? ' ⚠DUPLO' : ''
    const ppuStatus = r.ppuEmpty ? 'vazia' : r.ppuItems.toString()
    const issues = [
      ...r.dashMissing.map(m => `miss:${m}`),
      ...r.sheetIssues,
      doubleCount.trim(),
    ].filter(Boolean).join(', ')

    console.log(
      r.os.padEnd(12) +
      r.rev.padEnd(8) +
      hhD.padStart(10) +
      Math.round(r.hhBloco1).toString().padStart(10) +
      Math.round(r.hhBloco2).toString().padStart(10) +
      Math.round(r.hhEquipesExtracted).toString().padStart(10) +
      ppuStatus.padStart(6) +
      `  ${issues}`
    )
  }

  // ── Tarefas header label frequency ────────────────────────────────────────

  console.log('\n' + '═'.repeat(80))
  console.log('LABELS ENCONTRADOS NA ABA TAREFAS (por frequência):')
  console.log('─'.repeat(80))
  const sortedHeaders = [...allTarefasHeaders.entries()].sort((a, b) => b[1] - a[1])
  for (const [label, count] of sortedHeaders) {
    const bar = '█'.repeat(Math.round(count / reports.length * 20))
    console.log(`  ${String(count).padStart(4)}/${reports.length}  ${label.padEnd(40)} ${bar}`)
  }

  // ── Sheet name frequency ───────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(80))
  console.log('ABAS ENCONTRADAS (por frequência):')
  console.log('─'.repeat(80))
  const sortedSheets = [...allSheetNames.entries()].sort((a, b) => b[1] - a[1])
  for (const [name, count] of sortedSheets) {
    const pct = Math.round(count / reports.length * 100)
    console.log(`  ${String(count).padStart(4)}/${reports.length} (${String(pct).padStart(3)}%)  "${name}"`)
  }

  // ── Dashboard missing fields frequency ────────────────────────────────────

  console.log('\n' + '═'.repeat(80))
  console.log('CAMPOS DO DASHBOARD NÃO ENCONTRADOS (frequência):')
  console.log('─'.repeat(80))
  const missingCount: Record<string, number> = {}
  for (const r of reports) {
    for (const m of r.dashMissing) missingCount[m] = (missingCount[m] ?? 0) + 1
  }
  for (const [field, count] of Object.entries(missingCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}/${reports.length}  ${field}`)
  }

  // ── Projects with double-counting ─────────────────────────────────────────

  const duplos = reports.filter(r => r.hhBloco2 > 100)
  console.log('\n' + '═'.repeat(80))
  console.log(`PROJETOS COM DOUBLE-COUNTING NA ABA TAREFAS: ${duplos.length}/${reports.length}`)
  for (const r of duplos) {
    console.log(`  ${r.os}  bloco1=${Math.round(r.hhBloco1)}h  bloco2=${Math.round(r.hhBloco2)}h  total_extraído=${Math.round(r.hhEquipesExtracted)}h`)
  }

  console.log('\n' + '═'.repeat(80))
  console.log(`Total projetos analisados: ${reports.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
